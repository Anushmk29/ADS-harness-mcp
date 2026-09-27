"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Grid,
  Layers,
  List,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Sliders,
  Sparkles,
  TrendingDown,
  Truck,
  Verified,
  Zap
} from "lucide-react";
import Link from "next/link";
import { api, apiBlob } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

type PurchasingItem = {
  item_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  produce_type?: string | null;
  pack_size: string;
  ordered_pack_count: number;
  ordered_weight_kg: number;
  buffer_percentage: number;
  buffer_pack_count: number;
  buffer_weight_kg: number;
  total_purchase_target_packs: number;
  total_purchase_target_weight_kg: number;
  required_packs: number;
  required_weight_kg: number;
  confirmed_purchased_pack_count?: number | null;
  confirmed_purchased_weight_kg?: number | null;
  shortage_reason?: string | null;
};

type MasterPurchasingBatch = {
  batch_id: string;
  batch_reference: string;
  status?: string | null;
  created_at?: string | null;
  total_skus: number;
  total_ordered_weight_kg: number;
  total_buffer_weight_kg: number;
  total_required_weight_kg: number;
  items: PurchasingItem[];
};

function getProduceEmoji(name: string, type?: string | null): string {
  const lower = `${name} ${type || ""}`.toLowerCase();
  if (lower.includes("chili") || lower.includes("ớt")) return "🌶️";
  if (lower.includes("krachai") || lower.includes("củ ngải") || lower.includes("gừng") || lower.includes("riềng") || lower.includes("root")) return "🫚";
  if (lower.includes("durian") || lower.includes("sầu riêng")) return "🍈";
  if (lower.includes("mango") || lower.includes("xoài")) return "🥭";
  if (lower.includes("basil") || lower.includes("húng") || lower.includes("chà ôm") || lower.includes("acacia") || lower.includes("herb")) return "🌿";
  if (lower.includes("morning glory") || lower.includes("muống") || lower.includes("leafy")) return "🥬";
  return "📦";
}

function getCategoryDisplay(item: PurchasingItem): { label: string; dotClass: string } {
  const type = (item.produce_type || "").toUpperCase();
  const lower = `${item.product_name} ${item.product_code}`.toLowerCase();
  if (type === "HERB" || lower.includes("herb") || lower.includes("basil") || lower.includes("chà ôm") || lower.includes("ngò")) {
    return { label: "Herbs", dotClass: "bg-emerald-500" };
  }
  if (type === "ROOT" || lower.includes("root") || lower.includes("krachai") || lower.includes("gừng") || lower.includes("củ")) {
    return { label: "Roots", dotClass: "bg-amber-500" };
  }
  if (type === "FRUIT" || lower.includes("fruit") || lower.includes("mango") || lower.includes("durian") || lower.includes("xoài")) {
    return { label: "Fruits", dotClass: "bg-purple-500" };
  }
  if (type === "LEAFY" || lower.includes("leafy") || lower.includes("muống") || lower.includes("cải")) {
    return { label: "Leafy", dotClass: "bg-cyan-500" };
  }
  return { label: "General Produce", dotClass: "bg-slate-400" };
}

export default function ProcurementPage() {
  const [batchIdInput, setBatchIdInput] = useState("");
  const [batch, setBatch] = useState<MasterPurchasingBatch | null>(null);
  const [confirmedPacks, setConfirmedPacks] = useState<Record<string, number>>({});
  const [confirmedWeights, setConfirmedWeights] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters & Views
  const [activeFilter, setActiveFilter] = useState<"all" | "attention" | "pending" | "confirmed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCategoryView, setIsCategoryView] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});

  // Buffer Adjustment Modal
  const [editingItem, setEditingItem] = useState<PurchasingItem | null>(null);
  const [newBufferPct, setNewBufferPct] = useState<number>(10);
  const [bufferBusy, setBufferBusy] = useState(false);

  // Bulk Buffer Modal
  const [showBulkBufferModal, setShowBulkBufferModal] = useState(false);
  const [bulkBufferPct, setBulkBufferPct] = useState<number>(10);
  const [bulkBufferBusy, setBulkBufferBusy] = useState(false);

  // Initial Load: Fetch latest batch from backend
  useEffect(() => {
    let active = true;
    api<MasterPurchasingBatch>("/procurement/latest-batch")
      .then(data => {
        if (!active) return;
        setBatch(data);
        setBatchIdInput(data.batch_reference);
        initializeConfirmations(data.items);
        setError("");
      })
      .catch(reason => {
        if (!active) return;
        setBatch(null);
        setError(reason instanceof Error ? reason.message : "Failed to load the latest procurement batch");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function initializeConfirmations(items: PurchasingItem[]) {
    const packs: Record<string, number> = {};
    const wts: Record<string, number> = {};
    for (const it of items) {
      if (it.confirmed_purchased_pack_count !== null && it.confirmed_purchased_pack_count !== undefined) {
        packs[it.item_id] = it.confirmed_purchased_pack_count;
        wts[it.item_id] = it.confirmed_purchased_weight_kg ?? it.total_purchase_target_weight_kg;
      } else {
        packs[it.item_id] = it.total_purchase_target_packs;
        wts[it.item_id] = it.total_purchase_target_weight_kg;
      }
    }
    setConfirmedPacks(packs);
    setConfirmedWeights(wts);
  }

  async function loadLatestBatch() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await api<MasterPurchasingBatch>("/procurement/latest-batch");
      setBatch(data);
      setBatchIdInput(data.batch_reference);
      initializeConfirmations(data.items);
    } catch (reason) {
      setBatch(null);
      setError(reason instanceof Error ? reason.message : "Failed to load latest procurement batch");
    } finally {
      setLoading(false);
    }
  }

  async function loadBatchById(refOrId: string) {
    if (!refOrId.trim()) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await api<MasterPurchasingBatch>(`/procurement/batches/${refOrId.trim()}`);
      setBatch(data);
      setBatchIdInput(data.batch_reference);
      initializeConfirmations(data.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load procurement batch");
    } finally {
      setLoading(false);
    }
  }

  // 1-Click Match Single Target
  function handleMatchSingleTarget(item: PurchasingItem) {
    setConfirmedPacks(prev => ({ ...prev, [item.item_id]: item.total_purchase_target_packs }));
    setConfirmedWeights(prev => ({ ...prev, [item.item_id]: item.total_purchase_target_weight_kg }));
  }

  // Auto-fill all matching targets
  function handleAutoFillAllTargets() {
    if (!batch) return;
    const newPacks: Record<string, number> = { ...confirmedPacks };
    const newWts: Record<string, number> = { ...confirmedWeights };
    for (const it of batch.items) {
      newPacks[it.item_id] = it.total_purchase_target_packs;
      newWts[it.item_id] = it.total_purchase_target_weight_kg;
    }
    setConfirmedPacks(newPacks);
    setConfirmedWeights(newWts);
    setSuccess("Filled target quantities for all produce lines in batch.");
  }

  // Confirm purchases to backend API
  async function confirmPurchases(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!batch) return;
    setConfirmBusy(true);
    setError("");
    setSuccess("");

    const confirmations = batch.items.map(it => ({
      item_id: it.item_id,
      purchased_pack_count: Number(confirmedPacks[it.item_id] ?? it.total_purchase_target_packs),
      purchased_weight_kg: Number(confirmedWeights[it.item_id] ?? it.total_purchase_target_weight_kg),
    }));

    try {
      const result = await api<{ status: string; batch_reference: string }>(
        `/procurement/batches/${batch.batch_id}/confirm`,
        {
          method: "PUT",
          body: JSON.stringify({ items: confirmations }),
        }
      );
      setSuccess(`✓ Procurement Confirmed: Batch ${result.batch_reference} status is ${result.status}. Ready for Handoff 01.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Confirmation failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  // Dispatch Signed Handoff 01 to Packing Floor
  async function dispatchHandoff() {
    if (!batch) return;
    setHandoffBusy(true);
    setError("");
    try {
      const result = await api<{ handoff_id: string; payload_sha256: string }>("/agents/handoff-01/dispatch", {
        method: "POST",
        body: JSON.stringify({ batch_id: batch.batch_id }),
      });
      setSuccess(`✓ Handoff 01 Dispatched to Packing Dock! ID: ${result.handoff_id.slice(0, 8)}…, SHA-256: ${result.payload_sha256.slice(0, 12)}…`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Handoff 01 dispatch failed");
    } finally {
      setHandoffBusy(false);
    }
  }

  // Open Talad Thai Buyer Sheet
  async function openBuyerSheet() {
    if (!batch) return;
    setError("");
    try {
      const blob = await apiBlob(`/procurement/batches/${batch.batch_id}/buyer-sheet?format=html`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Buyer sheet could not be opened");
    }
  }

  // Update Single Buffer %
  async function updateBuffer(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem || !batch) return;
    setBufferBusy(true);
    try {
      await api(`/procurement/items/${editingItem.item_id}/buffer`, {
        method: "PUT",
        body: JSON.stringify({
          buffer_percentage: Number(newBufferPct),
          save_as_default: true,
        }),
      });
      setSuccess(`Updated buffer to ${newBufferPct}% for ${editingItem.product_code}`);
      setEditingItem(null);
      await loadBatchById(batch.batch_reference);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to update buffer percentage");
    } finally {
      setBufferBusy(false);
    }
  }

  // Bulk Apply Buffer %
  async function applyBulkBuffer(e: React.FormEvent) {
    e.preventDefault();
    if (!batch) return;
    setBulkBufferBusy(true);
    setError("");
    try {
      const itemsToUpdate = batch.items;
      for (const item of itemsToUpdate) {
        await api(`/procurement/items/${item.item_id}/buffer`, {
          method: "PUT",
          body: JSON.stringify({
            buffer_percentage: Number(bulkBufferPct),
            save_as_default: false,
          }),
        });
      }
      setSuccess(`Applied ${bulkBufferPct}% buffer across all ${itemsToUpdate.length} produce lines.`);
      setShowBulkBufferModal(false);
      await loadBatchById(batch.batch_reference);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to apply bulk buffer");
    } finally {
      setBulkBufferBusy(false);
    }
  }

  // Mathematical computations from live data
  const {
    totalOrderedPacks,
    totalBufferPacks,
    totalTargetPacks,
    avgBufferPct,
    categoryCounts,
    itemStatuses,
    statusCounts,
  } = useMemo(() => {
    if (!batch || !batch.items) {
      return {
        totalOrderedPacks: 0,
        totalBufferPacks: 0,
        totalTargetPacks: 0,
        avgBufferPct: "0.0",
        categoryCounts: { herbs: 0, roots: 0, fruits: 0, other: 0 },
        itemStatuses: {},
        statusCounts: { confirmed: 0, attention: 0, pending: 0 },
      };
    }

    let ordPacks = 0;
    let bufPacks = 0;
    let tgtPacks = 0;
    const cat = { herbs: 0, roots: 0, fruits: 0, other: 0 };
    const statuses: Record<string, "exact" | "under" | "over" | "pending"> = {};
    let confirmedCount = 0;
    let attentionCount = 0;
    let pendingCount = 0;

    for (const it of batch.items) {
      ordPacks += it.ordered_pack_count;
      bufPacks += it.buffer_pack_count;
      tgtPacks += it.total_purchase_target_packs;

      // Category breakdown
      const { label } = getCategoryDisplay(it);
      if (label === "Herbs") cat.herbs++;
      else if (label === "Roots") cat.roots++;
      else if (label === "Fruits") cat.fruits++;
      else cat.other++;

      // Discrepancy & confirmation status
      const p = confirmedPacks[it.item_id];
      if (p === undefined || p === null) {
        statuses[it.item_id] = "pending";
        pendingCount++;
      } else if (p === it.total_purchase_target_packs) {
        statuses[it.item_id] = "exact";
        confirmedCount++;
      } else if (p < it.total_purchase_target_packs) {
        statuses[it.item_id] = "under";
        attentionCount++;
      } else {
        statuses[it.item_id] = "over";
        confirmedCount++;
      }
    }

    const avgBuf = batch.total_ordered_weight_kg > 0
      ? ((batch.total_buffer_weight_kg / batch.total_ordered_weight_kg) * 100).toFixed(1)
      : "0.0";

    return {
      totalOrderedPacks: ordPacks,
      totalBufferPacks: bufPacks,
      totalTargetPacks: tgtPacks,
      avgBufferPct: avgBuf,
      categoryCounts: cat,
      itemStatuses: statuses,
      statusCounts: { confirmed: confirmedCount, attention: attentionCount, pending: pendingCount },
    };
  }, [batch, confirmedPacks]);

  // Filtered and searched items
  const filteredItems = useMemo(() => {
    if (!batch || !batch.items) return [];

    return batch.items.filter(it => {
      // Filter tab
      const status = itemStatuses[it.item_id];
      if (activeFilter === "attention" && status !== "under") return false;
      if (activeFilter === "pending" && status !== "pending") return false;
      if (activeFilter === "confirmed" && status !== "exact" && status !== "over") return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = it.product_name.toLowerCase().includes(query);
        const matchCode = it.product_code.toLowerCase().includes(query);
        const matchSize = it.pack_size.toLowerCase().includes(query);
        const matchType = (it.produce_type || "").toLowerCase().includes(query);
        if (!matchName && !matchCode && !matchSize && !matchType) return false;
      }

      return true;
    });
  }, [batch, activeFilter, searchQuery, itemStatuses]);

  // Selection toggle
  const allSelected = filteredItems.length > 0 && filteredItems.every(it => selectedItems[it.item_id]);
  function toggleSelectAll() {
    const next: Record<string, boolean> = { ...selectedItems };
    const targetVal = !allSelected;
    for (const it of filteredItems) {
      next[it.item_id] = targetVal;
    }
    setSelectedItems(next);
  }

  const confirmedPct = batch && batch.items.length > 0
    ? Math.round((statusCounts.confirmed / batch.items.length) * 100)
    : 0;
  const attentionPct = batch && batch.items.length > 0
    ? Math.round((statusCounts.attention / batch.items.length) * 100)
    : 0;
  const pendingPct = 100 - confirmedPct - attentionPct;

  return (
    <div className="page" style={{ maxWidth: "1680px", paddingBottom: "100px" }}>
      {/* 1. TOP COMMAND BAR & BATCH CONTEXT */}
      <header className="page-header" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
          {/* Breadcrumb & Batch Ref */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>
              <Link href="/" style={{ color: "#64748b" }}>Operations</Link>
              <span>/</span>
              <span style={{ color: "#0f172a", fontWeight: 700 }}>Procurement Command Workstation</span>
            </div>
            <span style={{ height: "14px", width: "1px", background: "#cbd5e1" }} />

            {/* Batch Ref Pill */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 10px",
              borderRadius: "999px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              fontSize: "0.78rem",
              boxShadow: "var(--shadow-sm)"
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#0f172a" }}>
                {batch?.batch_reference || "No Batch Loaded"}
              </span>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "0.68rem",
                fontWeight: 700,
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0"
              }}>
                <span className="status-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                {batch?.status?.replaceAll("_", " ") || "ACTIVE"}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons Group */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Talad Thai Departure countdown */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "10px",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              fontSize: "0.76rem",
              fontWeight: 600
            }}>
              <Clock size={15} color="#d97706" />
              <span>Talad Thai Market Cutoff: <strong style={{ color: "#78350f" }}>04:30 AM</strong></span>
            </div>

            {/* Buyer Sheet Export */}
            <button
              type="button"
              onClick={openBuyerSheet}
              disabled={!batch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 13px",
                borderRadius: "10px",
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                color: "#334155",
                fontSize: "0.78rem",
                fontWeight: 600,
                boxShadow: "var(--shadow-sm)",
                cursor: batch ? "pointer" : "not-allowed",
                opacity: batch ? 1 : 0.6
              }}
            >
              <Download size={15} color="#64748b" />
              <span>Export Buyer Sheet</span>
            </button>

            {/* Confirm All Matching Button */}
            <button
              type="button"
              onClick={handleAutoFillAllTargets}
              disabled={!batch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "10px",
                background: "#0d9488",
                border: "0",
                color: "#ffffff",
                fontSize: "0.78rem",
                fontWeight: 700,
                boxShadow: "0 1px 3px rgba(13, 148, 136, 0.3)",
                cursor: batch ? "pointer" : "not-allowed",
                opacity: batch ? 1 : 0.6
              }}
            >
              <Verified size={15} />
              <span>Match All Targets</span>
            </button>
          </div>
        </div>

        {/* Global Progress Indicator Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.76rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong style={{ color: "#0f172a" }}>Procurement Verification:</strong>
              <span style={{ color: "#0d9488", fontWeight: 700 }}>
                {confirmedPct}% ({statusCounts.confirmed} of {batch?.items.length ?? 0} SKUs verified)
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem" }}>
              <span style={{ color: "#059669", fontWeight: 600 }}>{statusCounts.confirmed} Confirmed</span>
              <span>•</span>
              <span style={{ color: "#d97706", fontWeight: 600 }}>{statusCounts.attention} Under Target</span>
              <span>•</span>
              <span style={{ color: "#64748b" }}>{statusCounts.pending} Pending</span>
            </div>
          </div>

          <div className="dual-progress-bar">
            <div style={{ width: `${confirmedPct}%`, background: "#0d9488", transition: "width 0.3s ease" }} title={`${confirmedPct}% Confirmed`} />
            <div style={{ width: `${attentionPct}%`, background: "#f59e0b", transition: "width 0.3s ease" }} title={`${attentionPct}% Attention Needed`} />
            <div style={{ width: `${pendingPct}%`, background: "#e2e8f0" }} title={`${pendingPct}% Pending`} />
          </div>
        </div>
      </header>

      <StatusMessage error={error} success={success} />

      {/* Batch Switcher / Loader Bar */}
      <div style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "10px 16px",
        marginBottom: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        boxShadow: "var(--shadow-sm)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", fontWeight: 700, color: "#334155" }}>
            Batch Reference:
            <input
              type="text"
              value={batchIdInput}
              onChange={e => setBatchIdInput(e.target.value)}
              placeholder="e.g. PUR-20260901-TONIO-DEMO"
              style={{
                padding: "5px 10px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.78rem",
                width: "240px"
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => loadBatchById(batchIdInput)}
            disabled={loading || !batchIdInput.trim()}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              background: "#0d9488",
              color: "#ffffff",
              border: 0,
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {loading ? "Loading…" : "Load Batch"}
          </button>
          <button
            type="button"
            onClick={loadLatestBatch}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              background: "#f1f5f9",
              color: "#334155",
              border: "1px solid #cbd5e1",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            <RefreshCw size={13} />
            <span>Latest Batch</span>
          </button>
        </div>

        {batch && (
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Loaded: <strong style={{ color: "#0f172a" }}>{batch.items.length} SKUs</strong> •
            Reference: <span style={{ fontFamily: "monospace" }}>{batch.batch_reference}</span>
          </div>
        )}
      </div>

      {batch ? (
        <div>
          {/* 2. MATHEMATICAL FORMULA PIPELINE STEP BAR (Base + Buffer = Target) */}
          <section aria-label="Procurement Calculation Formula Pipeline" style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
            marginBottom: "24px",
            position: "relative"
          }}>
            {/* Card 1: Consolidated Demand */}
            <div className="metric-card-v2" style={{ position: "relative" }}>
              <div className="metric-card-top">
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", letterSpacing: "0.06em" }}>
                  Consolidated Demand
                </span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  background: "#f1f5f9",
                  color: "#334155"
                }}>
                  {batch.total_skus} Line Items
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number">{batch.total_skus}</span>
                <span className="metric-number-sub">Total Produce SKUs</span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "4px" }}>
                Consolidated demand across wholesale export channels
              </div>
              {/* Category Breakdown bar */}
              <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#64748b" }}>
                  <span>Herbs: <strong style={{ color: "#0f172a" }}>{categoryCounts.herbs}</strong></span>
                  <span>Roots: <strong style={{ color: "#0f172a" }}>{categoryCounts.roots}</strong></span>
                  <span>Fruits: <strong style={{ color: "#0f172a" }}>{categoryCounts.fruits}</strong></span>
                </div>
                <div style={{ width: "100%", height: "5px", borderRadius: "999px", background: "#f1f5f9", display: "flex", overflow: "hidden" }}>
                  <div style={{ width: `${(categoryCounts.herbs / Math.max(1, batch.total_skus)) * 100}%`, background: "#10b981" }} />
                  <div style={{ width: `${(categoryCounts.roots / Math.max(1, batch.total_skus)) * 100}%`, background: "#f59e0b" }} />
                  <div style={{ width: `${(categoryCounts.fruits / Math.max(1, batch.total_skus)) * 100}%`, background: "#a855f7" }} />
                  <div style={{ width: `${(categoryCounts.other / Math.max(1, batch.total_skus)) * 100}%`, background: "#06b6d4" }} />
                </div>
              </div>
              <span className="math-connector">+</span>
            </div>

            {/* Card 2: Step 01 - Base Customer Demand */}
            <div className="metric-card-v2" style={{ position: "relative" }}>
              <div className="metric-card-top">
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#1e40af", letterSpacing: "0.06em" }}>
                  Step 01 • Demand
                </span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe"
                }}>
                  Net Requisition
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number" style={{ color: "#1e3a8a" }}>
                  {batch.total_ordered_weight_kg.toFixed(2)}
                </span>
                <span className="metric-number-sub">kg</span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "4px" }}>
                Exact client demand volume prior to trimming
              </div>
              <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", fontSize: "0.74rem" }}>
                <span style={{ color: "#64748b" }}>Order Base Packs</span>
                <strong style={{ fontFamily: "monospace", color: "#1e40af" }}>{totalOrderedPacks} packs</strong>
              </div>
              <span className="math-connector">+</span>
            </div>

            {/* Card 3: Step 02 - Trimming Buffer Allowance */}
            <div className="metric-card-v2" style={{ position: "relative", background: "linear-gradient(180deg, #ffffff 0%, #fffdf5 100%)", borderColor: "#fef3c7" }}>
              <div className="metric-card-top">
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#b45309", letterSpacing: "0.06em" }}>
                  Step 02 • Buffer
                </span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  background: "#fef3c7",
                  color: "#b45309",
                  border: "1px solid #fde68a"
                }}>
                  {avgBufferPct}% Avg Buffer
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number" style={{ color: "#d97706" }}>
                  +{batch.total_buffer_weight_kg.toFixed(2)}
                </span>
                <span className="metric-number-sub" style={{ color: "#b45309" }}>kg</span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: "4px" }}>
                Trimming allowance & transit shrinkage reserve
              </div>
              <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid #fef3c7", display: "flex", justifyContent: "space-between", fontSize: "0.74rem" }}>
                <span style={{ color: "#64748b" }}>Buffer Reserve Packs</span>
                <strong style={{ fontFamily: "monospace", color: "#b45309" }}>+{totalBufferPacks} packs</strong>
              </div>
              <span className="math-connector" style={{ color: "#0d9488", background: "#f0fdf4", borderColor: "#a7f3d0" }}>=</span>
            </div>

            {/* Card 4: Step 03 - Target Purchase (Combined Order) */}
            <div className="metric-card-v2" style={{
              background: "linear-gradient(135deg, #042f2e 0%, #0f766e 60%, #115e59 100%)",
              color: "#ffffff",
              boxShadow: "var(--shadow-md)"
            }}>
              <div className="metric-card-top">
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "#99f6e4", letterSpacing: "0.06em" }}>
                  Step 03 • Target Formula
                </span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  background: "#34d399",
                  color: "#022c22",
                  fontFamily: "monospace"
                }}>
                  Ready for Talad Thai
                </span>
              </div>
              <div className="metric-number-row">
                <span className="metric-number" style={{ color: "#ffffff" }}>
                  {batch.total_required_weight_kg.toFixed(2)}
                </span>
                <span className="metric-number-sub" style={{ color: "#99f6e4" }}>kg target</span>
              </div>
              <div style={{ fontSize: "0.76rem", color: "rgba(255, 255, 255, 0.8)", marginTop: "4px" }}>
                Base Demand + Dynamic Buffer combined purchase
              </div>
              <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.2)", display: "flex", justifyContent: "space-between", fontSize: "0.74rem" }}>
                <span style={{ color: "rgba(255, 255, 255, 0.8)" }}>Total Target Packs</span>
                <strong style={{ fontFamily: "monospace", color: "#ffffff" }}>{totalTargetPacks} total packs</strong>
              </div>
            </div>
          </section>

          {/* 3. WORKSHEET SECTION WITH TABS, SEARCH & ACTION TOOLBAR */}
          <section className="workflow-panel-v2" aria-label="Wholesale procurement worksheet">
            {/* Toolbar Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                {/* Segmented Filter Tabs */}
                <div style={{
                  display: "flex",
                  background: "#e2e8f0",
                  padding: "3px",
                  borderRadius: "10px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  overflowX: "auto"
                }}>
                  <button
                    type="button"
                    className={`filter-pill ${activeFilter === "all" ? "active" : ""}`}
                    onClick={() => setActiveFilter("all")}
                  >
                    All Items <span style={{ marginLeft: "4px", padding: "1px 6px", borderRadius: "999px", background: "#f1f5f9", fontSize: "0.68rem" }}>{batch.items.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${activeFilter === "attention" ? "active" : ""}`}
                    onClick={() => setActiveFilter("attention")}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", display: "inline-block", marginRight: "4px" }} />
                    Attention Needed <span style={{ marginLeft: "4px", padding: "1px 6px", borderRadius: "999px", background: "#fef3c7", color: "#b45309", fontSize: "0.68rem", fontWeight: 700 }}>{statusCounts.attention}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${activeFilter === "pending" ? "active" : ""}`}
                    onClick={() => setActiveFilter("pending")}
                  >
                    Pending Input <span style={{ marginLeft: "4px", padding: "1px 6px", borderRadius: "999px", background: "#f1f5f9", fontSize: "0.68rem" }}>{statusCounts.pending}</span>
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${activeFilter === "confirmed" ? "active" : ""}`}
                    onClick={() => setActiveFilter("confirmed")}
                  >
                    <CheckCircle2 size={13} color="#059669" style={{ display: "inline-block", marginRight: "4px", verticalAlign: "middle" }} />
                    Confirmed & Matched <span style={{ marginLeft: "4px", padding: "1px 6px", borderRadius: "999px", background: "#d1fae5", color: "#065f46", fontSize: "0.68rem", fontWeight: 700 }}>{statusCounts.confirmed}</span>
                  </button>
                </div>

                {/* Right Controls: Search, View Toggle, Bulk Buffer */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {/* Search Bar */}
                  <div style={{ position: "relative", width: "240px" }}>
                    <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                    <input
                      type="text"
                      placeholder="Search SKU, produce, category..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 10px 6px 32px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.78rem",
                        background: "#ffffff"
                      }}
                    />
                  </div>

                  {/* Bulk Buffer % Button */}
                  <button
                    type="button"
                    onClick={() => setShowBulkBufferModal(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      color: "#b45309",
                      fontSize: "0.76rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "var(--shadow-sm)"
                    }}
                  >
                    <Sliders size={14} />
                    <span>Buffer Bulk Adjust %</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4. HIGH-FIDELITY WORKSHEET TABLE */}
            <form onSubmit={confirmPurchases}>
              <div style={{ overflowX: "auto" }}>
                <table className="worksheet-table">
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ width: "42px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all produce items"
                          style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                      </th>
                      <th style={{ width: "260px" }}>Produce Item & SKU</th>
                      <th style={{ width: "130px" }}>Category & Size</th>
                      <th className="col-demand" style={{ width: "140px", color: "#1e3a8a" }}>1. Base Demand</th>
                      <th className="col-buffer" style={{ width: "230px", color: "#92400e" }}>2. Buffer Allowance</th>
                      <th className="col-target" style={{ width: "160px", color: "#166534" }}>3. Target Purchase</th>
                      <th className="col-confirmed" style={{ width: "290px", color: "#0f172a" }}>Buyer Confirmation & Validation</th>
                      <th style={{ width: "110px", textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(it => {
                      const { label: catLabel, dotClass } = getCategoryDisplay(it);
                      const emoji = getProduceEmoji(it.product_name, it.produce_type);
                      const currentPackInput = confirmedPacks[it.item_id] ?? it.total_purchase_target_packs;
                      const currentWeightInput = confirmedWeights[it.item_id] ?? it.total_purchase_target_weight_kg;

                      // Discrepancy calculation
                      const isExact = currentPackInput === it.total_purchase_target_packs;
                      const isUnder = currentPackInput < it.total_purchase_target_packs;
                      const isOver = currentPackInput > it.total_purchase_target_packs;
                      const packDiff = currentPackInput - it.total_purchase_target_packs;

                      return (
                        <tr key={it.item_id} style={{
                          background: isUnder ? "rgba(254, 243, 199, 0.1)" : "inherit"
                        }}>
                          {/* Checkbox */}
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!selectedItems[it.item_id]}
                              onChange={e => setSelectedItems({ ...selectedItems, [it.item_id]: e.target.checked })}
                              aria-label={`Select ${it.product_code}`}
                              style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                          </td>

                          {/* Produce Item & SKU */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{
                                width: "34px",
                                height: "34px",
                                borderRadius: "8px",
                                background: "#f0fdf4",
                                border: "1px solid #dcfce7",
                                display: "grid",
                                placeItems: "center",
                                fontSize: "1.1rem",
                                flexShrink: 0
                              }}>
                                {emoji}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <strong style={{ display: "block", color: "#0f172a", fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {it.product_name}
                                </strong>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                                  <span style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: "4px",
                                    background: "#f0fdfa",
                                    color: "#0d9488",
                                    border: "1px solid #ccfbf1"
                                  }}>
                                    SKU: {it.product_code}
                                  </span>
                                  {it.produce_type && (
                                    <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
                                      {it.produce_type}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category & Size */}
                          <td>
                            <div>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.75rem", fontWeight: 600, color: "#334155" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block" }} className={dotClass} />
                                {catLabel}
                              </span>
                              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                                {it.pack_size}
                              </div>
                            </div>
                          </td>

                          {/* 1. Base Demand */}
                          <td className="col-demand">
                            <div>
                              <strong style={{ color: "#1e40af", fontSize: "0.86rem" }}>
                                {it.ordered_pack_count} packs
                              </strong>
                              <div style={{ fontFamily: "monospace", fontSize: "0.74rem", color: "#3b82f6" }}>
                                {it.ordered_weight_kg.toFixed(2)} kg
                              </div>
                            </div>
                          </td>

                          {/* 2. Buffer Allowance */}
                          <td className="col-buffer">
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <span style={{ fontWeight: 700, color: "#b45309", fontSize: "0.82rem" }}>
                                  +{it.buffer_pack_count} packs <small style={{ fontWeight: 500, color: "#d97706" }}>(+{it.buffer_weight_kg.toFixed(2)} kg)</small>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem(it);
                                    setNewBufferPct(it.buffer_percentage);
                                  }}
                                  style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "5px",
                                    background: "#fef3c7",
                                    color: "#92400e",
                                    border: "1px solid #fde68a",
                                    cursor: "pointer"
                                  }}
                                  title="Edit buffer percentage"
                                >
                                  {it.buffer_percentage}% (edit)
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* 3. Target Purchase */}
                          <td className="col-target">
                            <div>
                              <strong style={{ color: "#166534", fontSize: "0.95rem", display: "block" }}>
                                {it.total_purchase_target_packs} packs
                              </strong>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#15803d", fontWeight: 700, fontSize: "0.76rem" }}>
                                {it.total_purchase_target_weight_kg.toFixed(2)} kg target
                              </span>
                            </div>
                          </td>

                          {/* Buyer Confirmation & Validation */}
                          <td className="col-confirmed">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <div style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                background: "#ffffff",
                                border: isUnder ? "1px solid #fde68a" : "1px solid #cbd5e1",
                                boxShadow: "var(--shadow-sm)"
                              }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={currentPackInput}
                                  onChange={e => setConfirmedPacks({ ...confirmedPacks, [it.item_id]: Number(e.target.value) })}
                                  style={{
                                    width: "44px",
                                    textAlign: "center",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 700,
                                    border: 0,
                                    padding: 0,
                                    color: isUnder ? "#92400e" : "#0f172a",
                                    outline: "none"
                                  }}
                                  title="Confirmed Pack Count"
                                />
                                <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontFamily: "monospace" }}>pk</span>
                              </div>

                              <span style={{ color: "#cbd5e1" }}>/</span>

                              <div style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                background: "#ffffff",
                                border: isUnder ? "1px solid #fde68a" : "1px solid #cbd5e1",
                                boxShadow: "var(--shadow-sm)"
                              }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={currentWeightInput}
                                  onChange={e => setConfirmedWeights({ ...confirmedWeights, [it.item_id]: Number(e.target.value) })}
                                  style={{
                                    width: "60px",
                                    textAlign: "center",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 700,
                                    border: 0,
                                    padding: 0,
                                    color: isUnder ? "#92400e" : "#0f172a",
                                    outline: "none"
                                  }}
                                  title="Confirmed Total Weight (kg)"
                                />
                                <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontFamily: "monospace" }}>kg</span>
                              </div>

                              {/* Live Validation Badges */}
                              {isExact ? (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  background: "#ecfdf5",
                                  color: "#047857",
                                  border: "1px solid #a7f3d0"
                                }}>
                                  <Check size={12} color="#059669" /> Exact Match
                                </span>
                              ) : isUnder ? (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  border: "1px solid #fde68a"
                                }}>
                                  <AlertTriangle size={12} color="#d97706" />
                                  ▲ Under by {Math.abs(packDiff)} pk
                                </span>
                              ) : isOver ? (
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  background: "#faf5ff",
                                  color: "#6b21a8",
                                  border: "1px solid #e9d5ff"
                                }}>
                                  +{packDiff} Over Target
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleMatchSingleTarget(it)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    background: "#f0fdfa",
                                    color: "#0f766e",
                                    border: "1px solid #99f6e4",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    cursor: "pointer"
                                  }}
                                >
                                  <Zap size={11} /> Match Target
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ textAlign: "center" }}>
                            {isUnder ? (
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                background: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a"
                              }}>
                                Needs Attention
                              </span>
                            ) : (
                              <span style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                background: "#ecfdf5",
                                color: "#065f46",
                                border: "1px solid #a7f3d0"
                              }}>
                                Confirmed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Summary */}
              <div style={{
                padding: "14px 20px",
                background: "#f8fafc",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                fontSize: "0.76rem",
                color: "#64748b"
              }}>
                <div>
                  Showing <strong style={{ color: "#0f172a" }}>{filteredItems.length}</strong> of {batch.items.length} wholesale produce lines •
                  Formula: <span style={{ fontFamily: "monospace", color: "#0f172a" }}>Base Demand + Trimming Buffer = Target Purchase</span>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="submit"
                    disabled={confirmBusy}
                    className="primary-button"
                    style={{ background: "#0d9488", minHeight: "38px", fontSize: "0.82rem" }}
                  >
                    <Verified size={15} />
                    {confirmBusy ? "Confirming…" : "Confirm Actual Market Purchases"}
                  </button>
                  <button
                    type="button"
                    disabled={handoffBusy}
                    className="primary-button"
                    onClick={dispatchHandoff}
                    style={{ background: "#1e3a8a", minHeight: "38px", fontSize: "0.82rem" }}
                  >
                    <Send size={15} />
                    {handoffBusy ? "Dispatching…" : "Dispatch Signed Handoff 01"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* 5. BOTTOM ELEVATED BUYER CONFIRMATION BAR */}
          <div className="procurement-floating-bar" aria-label="Buyer confirmation actions">
            {/* Left: Counts & Target Weight */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(13, 148, 136, 0.2)",
                border: "1px solid rgba(20, 184, 166, 0.4)",
                display: "grid",
                placeItems: "center",
                color: "#2dd4bf"
              }}>
                <ShoppingBag size={18} />
              </div>
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ffffff" }}>
                  {statusCounts.confirmed} of {batch.items.length} SKUs confirmed
                  <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "6px" }}>
                    • {batch.items.length - statusCounts.confirmed} remaining
                  </span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#5eead4", fontFamily: "'JetBrains Mono', monospace" }}>
                  Total Batch Target: {batch.total_required_weight_kg.toFixed(2)} kg
                </div>
              </div>
            </div>

            {/* Middle: Quick Action Chips */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleAutoFillAllTargets}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 12px",
                  borderRadius: "999px",
                  background: "rgba(30, 41, 59, 0.8)",
                  border: "1px solid #334155",
                  color: "#e2e8f0",
                  fontSize: "0.74rem",
                  cursor: "pointer"
                }}
              >
                <Zap size={13} color="#2dd4bf" />
                <span>Auto-fill all target matching</span>
              </button>

              {statusCounts.attention > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("attention")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    borderRadius: "999px",
                    background: "rgba(120, 53, 15, 0.4)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    color: "#fde68a",
                    fontSize: "0.74rem",
                    cursor: "pointer"
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                  <span>Review {statusCounts.attention} discrepancies</span>
                </button>
              )}
            </div>

            {/* Right: Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => confirmPurchases()}
                disabled={confirmBusy}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  color: "#ffffff",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {confirmBusy ? "Saving…" : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={dispatchHandoff}
                disabled={handoffBusy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 18px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0d9488 0%, #059669 100%)",
                  border: 0,
                  color: "#ffffff",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  boxShadow: "0 4px 12px rgba(13, 148, 136, 0.3)",
                  cursor: "pointer"
                }}
              >
                <Truck size={16} />
                <span>Dispatch Confirmed to Talad Thai Dock</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / No Batch Loaded State */
        <div className="panel" style={{ textAlign: "center", padding: "60px 24px" }}>
          <ShoppingBag size={48} color="#94a3b8" style={{ margin: "0 auto 16px" }} />
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 8px" }}>No Procurement Batch Loaded</h3>
          <p style={{ color: "var(--muted)", maxWidth: "520px", margin: "0 auto 20px", fontSize: "0.88rem" }}>
            Split an incoming order matrix in Stage 01 (Order Intake) to consolidate a Master Purchase Order, or enter an existing Batch Reference above.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <button
              type="button"
              onClick={loadLatestBatch}
              disabled={loading}
              className="primary-button"
              style={{ background: "#0d9488" }}
            >
              {loading ? "Checking…" : "Load Latest Batch"}
            </button>
            <Link
              href="/orders"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "0 18px",
                borderRadius: "11px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                fontSize: "0.88rem",
                fontWeight: 700
              }}
            >
              Go to Order Intake →
            </Link>
          </div>
        </div>
      )}

      {/* EDIT SINGLE BUFFER MODAL */}
      {editingItem && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px"
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            padding: "24px",
            width: "100%",
            maxWidth: "440px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
          }}>
            <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 750 }}>Adjust Trimming Buffer %</h3>
            <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "0 0 16px" }}>
              Set yield buffer allowance for <strong style={{ color: "#0f172a" }}>{editingItem.product_code}</strong> ({editingItem.product_name}).
            </p>

            <form onSubmit={updateBuffer} style={{ display: "grid", gap: "16px" }}>
              <label style={{ display: "grid", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Buffer Percentage (%):
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={newBufferPct}
                  onChange={e => setNewBufferPct(Number(e.target.value))}
                  required
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontFamily: "monospace",
                    fontSize: "0.95rem"
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bufferBusy}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#0d9488",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "0.82rem"
                  }}
                >
                  {bufferBusy ? "Saving…" : "Save Sticky Buffer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK BUFFER MODAL */}
      {showBulkBufferModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px"
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            padding: "24px",
            width: "100%",
            maxWidth: "460px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
          }}>
            <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 750 }}>Bulk Adjust Trimming Buffer %</h3>
            <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "0 0 16px" }}>
              Apply a universal buffer percentage across all {batch?.items.length ?? 0} line items in this batch to recalculate purchasing targets.
            </p>

            <form onSubmit={applyBulkBuffer} style={{ display: "grid", gap: "16px" }}>
              <label style={{ display: "grid", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Universal Buffer Percentage (%):
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={bulkBufferPct}
                  onChange={e => setBulkBufferPct(Number(e.target.value))}
                  required
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontFamily: "monospace",
                    fontSize: "0.95rem"
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowBulkBufferModal(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 600
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkBufferBusy}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#d97706",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "0.82rem"
                  }}
                >
                  {bulkBufferBusy ? "Applying…" : "Apply to Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
