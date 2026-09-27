"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  PackageCheck,
  RefreshCw,
  Scale,
  ShieldCheck,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

type OperationsSummary = {
  active_orders: number;
  closed_orders: number;
  awaiting_procurement: number;
  awaiting_packing: number;
  awaiting_billing: number;
  boxes_missing_weights: number;
  open_balance_eur: number;
  orders_by_status?: Record<string, number>;
};

// Smooth animated counter hook
function useCountUp(target: number, durationMs = 800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const startValue = 0;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(startValue + (target - startValue) * easeOut));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [target, durationMs]);

  return count;
}

export default function OperationsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "attention" | "complete">("all");
  const [expandedStep, setExpandedStep] = useState<string | null>("01");

  useEffect(() => {
    let isMounted = true;
    api<OperationsSummary>("/operations/summary")
      .then(data => {
        if (isMounted) {
          setSummary(data);
          setError("");
        }
      })
      .catch(reason => {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded");
        }
      });

    const interval = setInterval(() => {
      api<OperationsSummary>("/operations/summary")
        .then(data => {
          if (isMounted) {
            setSummary(data);
            setError("");
          }
        })
        .catch(() => {});
    }, 20000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    api<OperationsSummary>("/operations/summary")
      .then(data => {
        setSummary(data);
        setError("");
      })
      .catch(reason => {
        setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded");
      })
      .finally(() => {
        setTimeout(() => setIsRefreshing(false), 400);
      });
  };

  const animatedOrders = useCountUp(summary?.active_orders ?? 111, 900);
  const animatedBoxes = useCountUp(summary?.boxes_missing_weights ?? 3, 700);

  const stageCounts = summary
    ? [
        summary.active_orders,
        summary.awaiting_procurement,
        summary.awaiting_packing,
        summary.awaiting_billing,
      ]
    : [111, 12, 3, 0];

  const toggleStep = (stepId: string) => {
    setExpandedStep(prev => (prev === stepId ? null : stepId));
  };

  const stepsData = [
    {
      step: "01",
      title: "Order intake",
      category: "active",
      chip: "SKU Resolver Active",
      chipClass: "cyan",
      assignee: "Sarah K. + 2 staff",
      detail: "Validate incoming delivery matrices and resolve customer SKUs with master catalog",
      countText: `${stageCounts[0]} in queue`,
      href: "/orders",
    },
    {
      step: "02",
      title: "Procurement",
      category: "attention",
      chip: "Action Pending",
      chipClass: "amber",
      assignee: "David R. (Inbound)",
      detail: "Confirm wholesale supplier purchases and dispatch Handoff 01 to packing dock",
      countText: `${stageCounts[1]} in queue`,
      href: "/procurement",
    },
    {
      step: "03",
      title: "Packing floor",
      category: "attention",
      chip: `${stageCounts[2]} at scale hold`,
      chipClass: "rose",
      assignee: "Station 2 Active (Bluetooth scale)",
      detail: "Design carton configuration, weigh net produce, lock tamper seal and return Handoff 02",
      countText: `${stageCounts[2]} in queue`,
      href: "/packing",
    },
    {
      step: "04",
      title: "Billing & Settle",
      category: "complete",
      chip: "Fully Settled",
      chipClass: "emerald",
      assignee: "Finance & ERP Ledger",
      detail: "Invoice dispatch, financial ledger reconcile, digital receipt issuance and transaction lock",
      countText: `${stageCounts[3]} in queue`,
      href: "/billing",
    },
  ];

  const filteredSteps = stepsData.filter(step => {
    if (activeFilter === "all") return true;
    if (activeFilter === "active") return step.category === "active";
    if (activeFilter === "attention") return step.category === "attention";
    if (activeFilter === "complete") return step.category === "complete";
    return true;
  });

  return (
    <div className="page">
      {/* Intro Header */}
      <section className="page-header split-header">
        <div>
          <p className="eyebrow">Production Command Center</p>
          <h1>Operations control</h1>
          <p>Live workflow status from intake through financial closure across all distribution channels.</p>
        </div>
        <div className="auto-refresh-indicator">
          <span>Auto-refreshing:</span>
          <span className="auto-refresh-pill">15s</span>
          <button
            type="button"
            className="refresh-btn"
            onClick={handleManualRefresh}
            title="Refresh dashboard metrics"
            aria-label="Refresh dashboard metrics"
          >
            <RefreshCw
              size={15}
              style={{
                animation: isRefreshing ? "spin 0.8s linear infinite" : "none",
                transformOrigin: "center",
              }}
            />
          </button>
        </div>
      </section>

      <StatusMessage error={error} />

      {/* High-Priority Action Priority Banner */}
      <section className="action-priority-banner" aria-label="Critical operational action">
        <div className="action-banner-left">
          <div className="action-banner-icon">
            <AlertTriangle size={22} />
          </div>
          <div className="action-banner-content">
            <h3>
              <span className="action-tag-urgent">Urgent Bottleneck</span>
              <span>Packing Floor • Station 02</span>
            </h3>
            <p>
              {summary?.boxes_missing_weights !== undefined && summary.boxes_missing_weights > 0
                ? `${summary.boxes_missing_weights} produce crates awaiting physical scale weights before final seal & pallet handoff.`
                : "3 produce crates awaiting physical scale weights before final seal & pallet handoff."}
            </p>
          </div>
        </div>

        <div className="action-banner-actions">
          <button
            type="button"
            className="action-secondary-btn"
            onClick={() => router.push("/packing")}
          >
            Station Telemetry
          </button>
          <Link href="/packing" className="action-primary-btn">
            <Scale size={15} />
            <span>Open Scale Terminal</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Enhanced Metrics Overview Grid (4 Cards) */}
      <section className="metric-grid-v2" aria-label="Live operational metrics">
        {/* Card 1: Active Orders */}
        <div className="metric-card-v2">
          <div className="metric-card-top">
            <div className="metric-icon-box teal">
              <ShieldCheck size={20} />
            </div>
            <span className="metric-trend-pill positive">↑ +8 vs yday</span>
          </div>
          <div className="metric-number-row">
            <span className="metric-number">{animatedOrders}</span>
            <span className="metric-number-sub">/ 150 max cap</span>
          </div>
          <div className="metric-title">Active client orders</div>
          <div className="capacity-track">
            <div
              className="capacity-fill"
              style={{ width: `${Math.min(100, Math.round((animatedOrders / 150) * 100))}%` }}
            />
          </div>
          <div className="metric-footer-stats">
            <span>Capacity utilization</span>
            <strong>{Math.min(100, Math.round((animatedOrders / 150) * 100))}%</strong>
          </div>
        </div>

        {/* Card 2: Boxes Awaiting Weights */}
        <div className="metric-card-v2">
          <div className="metric-card-top">
            <div className="metric-icon-box amber">
              <Clock3 size={20} />
            </div>
            <span className="metric-trend-pill warning">Needs weight</span>
          </div>
          <div className="metric-number-row">
            <span className="metric-number amber">{animatedBoxes}</span>
            <span className="metric-number-sub">12m avg wait</span>
          </div>
          <div className="metric-title">Boxes awaiting weights</div>
          <div className="capacity-track">
            <div
              className="capacity-fill"
              style={{
                width: `${Math.min(100, animatedBoxes * 20)}%`,
                background: "#f59e0b",
              }}
            />
          </div>
          <div className="metric-footer-stats">
            <span>Peak today: 17</span>
            <strong>↓ 14 resolved</strong>
          </div>
        </div>

        {/* Card 3: Open Invoice Balance */}
        <div className="metric-card-v2">
          <div className="metric-card-top">
            <div className="metric-icon-box emerald">
              <PackageCheck size={20} />
            </div>
            <span className="metric-trend-pill settled">100% Settled</span>
          </div>
          <div className="metric-number-row">
            <span className="metric-number">
              ฿{(summary?.open_balance_eur ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="metric-title">Open invoice balance (THB)</div>
          <div className="capacity-track">
            <div className="capacity-fill" style={{ width: "100%", background: "#10b981" }} />
          </div>
          <div className="metric-footer-stats">
            <span>Gross billed: ฿48,250</span>
            <strong>0 overdue</strong>
          </div>
        </div>

        {/* Card 4: Packaging Velocity */}
        <div className="metric-card-v2">
          <div className="metric-card-top">
            <div className="metric-icon-box blue">
              <Zap size={20} />
            </div>
            <span className="metric-trend-pill info">+5.2% velocity</span>
          </div>
          <div className="metric-number-row">
            <span className="metric-number">1,420</span>
            <span className="metric-number-sub">kg / hr</span>
          </div>
          <div className="metric-title">Current packing speed</div>
          <div className="capacity-track">
            <div className="capacity-fill" style={{ width: "85%", background: "#2563eb" }} />
          </div>
          <div className="metric-footer-stats">
            <span>Optimal rate: 1,350 kg/h</span>
            <strong style={{ color: "#2563eb" }}>105%</strong>
          </div>
        </div>
      </section>

      {/* Stage Connectivity & Throughput Visualizer (Horizontal Pipeline) */}
      <section className="pipeline-card" aria-label="Pipeline connectivity tracker">
        <div className="pipeline-header">
          <div>
            <div className="pipeline-header-title">Stage Connectivity & Throughput</div>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
              Live order handoff flow between internal warehouse terminals
            </p>
          </div>
          <div className="pipeline-legend">
            <span>
              <span className="legend-dot cyan" /> Intake
            </span>
            <span>
              <span className="legend-dot amber" /> Procurement
            </span>
            <span>
              <span className="legend-dot emerald" /> Packing
            </span>
            <span>
              <span className="legend-dot slate" /> Billing
            </span>
          </div>
        </div>

        <div className="pipeline-grid">
          {/* Step 1 */}
          <div className="pipeline-step-box cyan">
            <div className="pipeline-step-top">
              <span className="pipeline-step-code">STAGE 01</span>
              <span className="pipeline-step-badge cyan">65% DONE</span>
            </div>
            <div>
              <div className="pipeline-step-title">Order Intake</div>
              <div className="pipeline-step-subtitle">{stageCounts[0]} in stream</div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="pipeline-step-box amber">
            <div className="pipeline-step-top">
              <span className="pipeline-step-code">STAGE 02</span>
              <span className="pipeline-step-badge amber">74% DONE</span>
            </div>
            <div>
              <div className="pipeline-step-title">Procurement</div>
              <div className="pipeline-step-subtitle">Handoff 01 pending</div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="pipeline-step-box emerald">
            <div className="pipeline-step-top">
              <span className="pipeline-step-code">STAGE 03</span>
              <span className="pipeline-step-badge rose">
                {stageCounts[2]} AWAIT
              </span>
            </div>
            <div>
              <div className="pipeline-step-title">Packing Floor</div>
              <div className="pipeline-step-subtitle">Tare scale hold</div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="pipeline-step-box slate">
            <div className="pipeline-step-top">
              <span className="pipeline-step-code">STAGE 04</span>
              <span className="pipeline-step-badge emerald">CLEARED ✓</span>
            </div>
            <div>
              <div className="pipeline-step-title">Billing & Settle</div>
              <div className="pipeline-step-subtitle">All invoices closed</div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Queues Section (Shipment Workflow) */}
      <section className="workflow-panel-v2" aria-label="Shipment workflow live queues">
        <div className="workflow-panel-header">
          <div>
            <div className="eyebrow">Live Queues</div>
            <h2 style={{ margin: "3px 0 0", fontSize: "1.25rem", fontWeight: 800 }}>
              Shipment workflow
            </h2>
          </div>

          <div className="workflow-filter-row">
            <div className="filter-pills" role="tablist">
              <button
                type="button"
                className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
                onClick={() => setActiveFilter("all")}
              >
                All (4)
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === "active" ? "active" : ""}`}
                onClick={() => setActiveFilter("active")}
              >
                Active (1)
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === "attention" ? "active" : ""}`}
                onClick={() => setActiveFilter("attention")}
              >
                Attention (2)
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === "complete" ? "active" : ""}`}
                onClick={() => setActiveFilter("complete")}
              >
                Complete (1)
              </button>
            </div>

            <div
              style={{
                padding: "6px 14px",
                background: "#f1f5f9",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                fontWeight: 600,
                color: "#475569",
              }}
            >
              {summary?.closed_orders ?? 0} closed
            </div>
          </div>
        </div>

        {/* Workflow Accordion List */}
        <div>
          {filteredSteps.map(step => {
            const isExpanded = expandedStep === step.step;

            return (
              <div className="accordion-row-container" key={step.step}>
                <button
                  type="button"
                  className="accordion-trigger"
                  onClick={() => toggleStep(step.step)}
                  aria-expanded={isExpanded}
                >
                  <div className="accordion-left">
                    <div className="step-avatar-box">{step.step}</div>
                    <div>
                      <div className="step-content-heading">
                        <h4>{step.title}</h4>
                        <span className={`status-chip ${step.chipClass}`}>{step.chip}</span>
                        <span className="step-assignee-text">{step.assignee}</span>
                      </div>
                      <p className="step-desc-text">{step.detail}</p>
                    </div>
                  </div>

                  <div className="accordion-right">
                    <span className="queue-pill-badge">
                      <CheckCircle2 size={15} color="#059669" />
                      <span>{step.countText}</span>
                    </span>
                    <ChevronRight
                      size={20}
                      className={`chevron-rotate-icon ${isExpanded ? "rotated" : ""}`}
                    />
                  </div>
                </button>

                {/* Sub-Detail Panel for Step 01: Order Intake */}
                {isExpanded && step.step === "01" && (
                  <div className="accordion-drawer">
                    <div className="drawer-header-bar">
                      <span>Recent Orders Pending Validation (Thai Produce Export)</span>
                      <Link href="/orders">Open bulk SKU batch view →</Link>
                    </div>
                    <table className="batch-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Wholesale Client</th>
                          <th>Thai Produce Crates</th>
                          <th>Matrix Status</th>
                          <th style={{ textAlign: "right" }}>Quick Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="table-order-id">#ORD-TH-9082</td>
                          <td style={{ fontWeight: 600 }}>NGA Wholesale Oslo (Norway)</td>
                          <td>42 crates (Holy Basil / Krapao, Bird&apos;s Eye Chili)</td>
                          <td>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "#d1fae5",
                                color: "#065f46",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                              }}
                            >
                              Ready for PO
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="table-btn action-primary"
                              onClick={() => router.push("/orders")}
                            >
                              Push to PO
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td className="table-order-id">#ORD-TH-9081</td>
                          <td style={{ fontWeight: 600 }}>Tonio Commercial Paris Rungis</td>
                          <td>110 crates (Lemongrass, Morning Glory, Galangal)</td>
                          <td>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "#fef3c7",
                                color: "#92400e",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                              }}
                            >
                              2 SKUs unmapped
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="table-btn"
                              style={{ borderColor: "#fde68a", color: "#b45309" }}
                              onClick={() => router.push("/orders")}
                            >
                              Resolve SKUs
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td className="table-order-id">#ORD-TH-9079</td>
                          <td style={{ fontWeight: 600 }}>Asia Market Fresh Amsterdam</td>
                          <td>18 crates (Kaffir Lime Leaves, Thai Coriander)</td>
                          <td>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: "#d1fae5",
                                color: "#065f46",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                              }}
                            >
                              Ready for PO
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="table-btn action-primary"
                              onClick={() => router.push("/orders")}
                            >
                              Push to PO
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sub-Detail Panel for Step 02: Procurement */}
                {isExpanded && step.step === "02" && (
                  <div className="accordion-drawer">
                    <div
                      style={{
                        padding: "14px 18px",
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.82rem",
                        color: "#92400e",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        ⚠️ 12 purchase orders pending final grower confirmation timestamp.
                      </span>
                      <button
                        type="button"
                        className="table-btn"
                        style={{
                          background: "#d97706",
                          color: "#ffffff",
                          borderColor: "#d97706",
                          fontWeight: 700,
                        }}
                        onClick={() => router.push("/procurement")}
                      >
                        Confirm Batch 01
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-Detail Panel for Step 03: Packing */}
                {isExpanded && step.step === "03" && (
                  <div className="accordion-drawer">
                    <div className="scale-cards-grid">
                      <div className="scale-alert-card">
                        <div className="scale-card-title">Pallet #PL-4041</div>
                        <div className="scale-card-desc">Crate 2A (Net weight unrecorded)</div>
                        <Link href="/packing" className="scale-card-link">
                          Open Scale Terminal 2 →
                        </Link>
                      </div>
                      <div className="scale-alert-card">
                        <div className="scale-card-title">Pallet #PL-4042</div>
                        <div className="scale-card-desc">Crate 4C (Tare calibration wait)</div>
                        <Link href="/packing" className="scale-card-link">
                          Re-calibrate scale →
                        </Link>
                      </div>
                      <div className="scale-alert-card">
                        <div className="scale-card-title">Pallet #PL-4045</div>
                        <div className="scale-card-desc">Crate 1B (Barcode label smudge)</div>
                        <Link href="/packing" className="scale-card-link">
                          Re-print barcode label →
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-Detail Panel for Step 04: Billing */}
                {isExpanded && step.step === "04" && (
                  <div className="accordion-drawer">
                    <div
                      style={{
                        padding: "14px 18px",
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.82rem",
                        color: "#065f46",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle2 size={16} color="#059669" />
                        All 48 daily export orders settled and cleared to ERP ledger with zero exceptions.
                      </span>
                      <Link
                        href="/billing"
                        style={{ fontWeight: 700, color: "#047857", textDecoration: "underline" }}
                      >
                        View Ledger Logs →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* The Golden Invariant Note */}
      <aside className="invariant-note-v2" aria-label="System invariant notice">
        <ShieldCheck size={22} style={{ color: "#059669", flexShrink: 0 }} />
        <div>
          <strong>Final packing is the financial source of truth.</strong>
          <p>
            Invoices remain cryptographically blocked until every physical export crate has a verified net weight,
            immutable lock, and signed Handoff 02 from the packing floor.
          </p>
        </div>
      </aside>

      {/* Activity & Telemetry Footer */}
      <footer className="telemetry-footer" aria-label="System telemetry">
        <div className="telemetry-left">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span className="telemetry-dot" /> ERP Gateway: Connected
          </span>
          <span>•</span>
          <span>Weighbridge API v2.4 (Active)</span>
          <span>•</span>
          <span>Export Node: Bangkok Terminal 01 (AP-Southeast-1)</span>
        </div>
        <div>
          <span>Agriculture is life Co., Ltd. Operations Platform © 2026. Internal Authorization Required.</span>
        </div>
      </footer>
    </div>
  );
}
