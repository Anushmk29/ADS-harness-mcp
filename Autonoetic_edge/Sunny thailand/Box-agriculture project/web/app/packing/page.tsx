"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Boxes,
  LockKeyhole,
  Play,
  ArrowRightLeft,
  Truck,
  Download,
  QrCode,
  Tag,
  CheckCircle2,
  X,
  Store,
  Layers,
  FileSpreadsheet,
  Zap,
  Receipt,
  ArrowRight
} from "lucide-react";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";
import QRCode from "qrcode";

type BoxItem = {
  product_id: string;
  product_code: string;
  produce_name: string;
  pack_size: string;
  packed_count: number;
  net_weight_kg: number;
  adjustment_type: string;
};

type BoxDetail = {
  box_id: string;
  box_number: number;
  box_type_name: string;
  is_overridden: boolean;
  actual_gross_weight_kg: number | null;
  actual_net_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  chargeable_weight_kg: number | null;
  is_locked: boolean;
  qr_code_uid: string;
  sticker_label: string;
  items: BoxItem[];
};

type PackingListResponse = {
  client_order_id: string;
  order_ref_id: string;
  sub_customer_code: string;
  route_code: string;
  shipment_date: string;
  total_boxes_count: number;
  boxes: BoxDetail[];
};

type BoxCatalogue = {
  id: string;
  size_name: string;
  box_type: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
};

type GroupSubCustomerOrder = {
  client_order_id: string;
  order_ref_id: string;
  sub_customer_code: string;
  company_name: string;
  route_group: string;
  total_ordered_items_count: number;
  total_estimated_net_weight_kg: number;
  boxes_count: number;
  boxes: Array<{
    box_id: string;
    box_number: number;
    box_type_name: string;
    sticker_label: string;
    actual_net_weight_kg: number | null;
  }>;
  note: string;
};

type GroupPackingResponse = {
  group_name: string;
  total_sub_customers: number;
  total_weight_kg: number;
  total_boxes_count: number;
  sub_customers: GroupSubCustomerOrder[];
};

type VehicleLoadExport = {
  route_code: string;
  shipment_date: string;
  total_boxes_count: number;
  total_gross_weight_kg: number;
  total_net_weight_kg: number;
  customers: Array<{
    customer_code: string;
    company_name: string;
    boxes_count: number;
    box_numbers: number[];
    total_net_kg: number;
    total_gross_kg: number;
  }>;
  checklist_text: string;
  csv_content: string;
};

type WeightDraft = { net: string; gross: string };

export default function PackingPage() {
  const [orderId, setOrderId] = useState("");
  const [packingData, setPackingData] = useState<PackingListResponse | null>(null);
  const [boxCatalogues, setBoxCatalogues] = useState<BoxCatalogue[]>([]);
  const [activeGroup, setActiveGroup] = useState("CT");
  const [groupData, setGroupData] = useState<GroupPackingResponse | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Smart Item Transfer Modal State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [sourceBoxId, setSourceBoxId] = useState("");
  const [targetBoxId, setTargetBoxId] = useState("");
  const [removeEmptySource, setRemoveEmptySource] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);

  // Box Transportation Export Modal State
  const [vehicleExport, setVehicleExport] = useState<VehicleLoadExport | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  // Sticker Print Preview Modal
  const [previewBox, setPreviewBox] = useState<BoxDetail | null>(null);
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState("");
  const [weightDrafts, setWeightDrafts] = useState<Record<string, WeightDraft>>({});
  const [handoffBusy, setHandoffBusy] = useState(false);

  useEffect(() => {
    // Load box catalogues for sizing drop-down
    api<BoxCatalogue[]>("/master-data/boxes")
      .then(cats => setBoxCatalogues(cats || []))
      .catch(reason => {
        setBoxCatalogues([]);
        setError(reason instanceof Error ? reason.message : "Failed to load the box catalogue");
      });

    // Pre-load CT group by default
    loadGroupSubCustomers("CT");
  }, []);

  useEffect(() => {
    if (!previewBox) return;
    let active = true;
    const scanUrl = `${window.location.origin}/scan/${encodeURIComponent(previewBox.qr_code_uid)}`;
    QRCode.toDataURL(scanUrl, { width: 280, margin: 1, errorCorrectionLevel: "M" })
      .then(dataUrl => { if (active) setPreviewQrDataUrl(dataUrl); })
      .catch(() => { if (active) setPreviewQrDataUrl(""); });
    return () => { active = false; };
  }, [previewBox]);

  async function loadPackingList(id: string) {
    if (!id.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<PackingListResponse>(`/packing/orders/${id.trim()}/packing-list`);
      setPackingData(data);
      setWeightDrafts(Object.fromEntries(data.boxes.map(box => {
        const expectedNet = box.items.reduce((sum, item) => sum + item.net_weight_kg, 0);
        return [box.box_id, {
          net: String(box.actual_net_weight_kg ?? expectedNet.toFixed(2)),
          gross: box.actual_gross_weight_kg == null ? "" : String(box.actual_gross_weight_kg),
        }];
      })));
      setOrderId(id.trim());
      setMessage(`Loaded packing list for ${data.sub_customer_code}: ${data.total_boxes_count} boxes.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load packing list");
    } finally {
      setBusy(false);
    }
  }

  async function saveBoxWeights(boxId: string) {
    const draft = weightDrafts[boxId];
    const net = Number(draft?.net);
    const gross = Number(draft?.gross);
    if (!Number.isFinite(net) || !Number.isFinite(gross)) {
      setError("Enter valid net and gross scale readings before saving.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/packing/boxes/${boxId}/weights`, {
        method: "PATCH",
        body: JSON.stringify({
          actual_net_weight_kg: net,
          actual_gross_weight_kg: gross,
          capture_source: "MANUAL_UI",
        }),
      });
      setMessage("Verified scale readings saved. This box is ready for final lock.");
      await loadPackingList(orderId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to save box weights");
    } finally {
      setBusy(false);
    }
  }

  async function returnHandoff02() {
    if (!orderId) return;
    setHandoffBusy(true);
    setError("");
    try {
      const result = await api<{ handoff_id: string; payload_sha256: string }>("/agents/handoff-02/return", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId }),
      });
      setMessage(`Final packing returned in signed Handoff 02 (${result.handoff_id.slice(0, 8)}…, SHA-256 ${result.payload_sha256.slice(0, 12)}…).`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Handoff 02 failed");
    } finally {
      setHandoffBusy(false);
    }
  }

  async function fastTrackPackOrder(targetOrderId?: string) {
    const idToPack = targetOrderId || orderId;
    if (!idToPack) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await api<{
        order_id: string;
        order_ref_id: string;
        status: string;
        boxes_count: number;
        total_net_weight_kg: number;
        total_gross_weight_kg: number;
      }>(`/packing/orders/${idToPack}/fast-track-pack`, { method: "POST" });

      setMessage(`✓ 1-Click Fast-Track Pack Complete for ${res.order_ref_id}: ${res.boxes_count} box(es), ${res.total_net_weight_kg.toFixed(2)} kg net. Template weights applied and invoicing unblocked!`);
      await loadPackingList(idToPack);
      if (activeGroup) await loadGroupSubCustomers(activeGroup);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fast-track packing failed");
    } finally {
      setBusy(false);
    }
  }

  async function fastTrackPackActiveGroup() {
    if (!activeGroup) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const res = await api<{
        group_name: string;
        orders_packed: number;
        total_boxes: number;
        total_net_weight_kg: number;
      }>(`/packing/groups/${activeGroup}/fast-track-pack`, { method: "POST" });

      setMessage(`✓ 1-Click Auto-Pack Complete for ${res.group_name}: ${res.orders_packed} store orders packed (${res.total_boxes} boxes, ${res.total_net_weight_kg.toFixed(2)} kg net). All customer invoices unblocked!`);
      if (activeGroup) await loadGroupSubCustomers(activeGroup);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Group fast-track packing failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadGroupSubCustomers(grp: string) {
    setActiveGroup(grp);
    setError("");
    try {
      const res = await api<GroupPackingResponse>(`/packing/groups/${grp}/sub-packing-lists`);
      setGroupData(res);
    } catch (reason) {
      setGroupData(null);
      setError(reason instanceof Error ? reason.message : "Failed to load the packing queue");
    }
  }

  async function runAction(path: string, body?: object) {
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const result = await api<{ status: string; boxes_created?: number }>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined
      });
      setMessage(`${result.status}${result.boxes_created ? ` · ${result.boxes_created} boxes created` : ""}`);
      if (orderId) {
        await loadPackingList(orderId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Packing action failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeBoxSize(boxId: string, newCatalogueId: string) {
    setError("");
    try {
      await api(`/packing/boxes/${boxId}/override-size`, {
        method: "PUT",
        body: JSON.stringify({
          new_catalogue_id: newCatalogueId,
          override_reason: "Floor box size adjustment via sizing dropdown"
        })
      });
      setMessage("✓ Box size updated successfully!");
      if (orderId) {
        await loadPackingList(orderId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to override box size");
    }
  }

  async function handleTransferContents(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceBoxId || !targetBoxId || sourceBoxId === targetBoxId) {
      setError("Please select distinct source and target boxes for combining");
      return;
    }
    setTransferBusy(true);
    setError("");

    try {
      await api("/packing/boxes/transfer-contents", {
        method: "POST",
        body: JSON.stringify({
          source_box_id: sourceBoxId,
          target_box_id: targetBoxId,
          remove_empty_source: removeEmptySource
        })
      });
      setMessage("✓ Items securely transferred to target box without re-typing SKUs!");
      setTransferModalOpen(false);
      if (orderId) {
        await loadPackingList(orderId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Transfer failed");
    } finally {
      setTransferBusy(false);
    }
  }

  async function triggerVehicleLoadExport() {
    setExportBusy(true);
    setError("");
    try {
      const route = packingData?.route_code || "TETE";
      const date = packingData?.shipment_date ?? new Date().toISOString().slice(0, 10);
      const data = await api<VehicleLoadExport>(
        `/packing/transportation-manifests/export-vehicle-load?route_code=${route}&shipment_date=${date}`
      );
      setVehicleExport(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to generate transportation export file");
    } finally {
      setExportBusy(false);
    }
  }

  function downloadExportFile() {
    if (!vehicleExport) return;
    const blob = new Blob([vehicleExport.csv_content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Vehicle_Load_Totals_${vehicleExport.route_code}_${vehicleExport.shipment_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="page" style={{ maxWidth: "1280px" }}>
      <header className="page-header">
        <p className="eyebrow">Stage 03 · Packing Floor Operations</p>
        <h1>Packing Floor Console & Box Resizing</h1>
        <p>Dynamic box sizing, smart item transfer across boxes, standardized alphanumeric stickers, and vehicle load export.</p>
      </header>

      <StatusMessage error={error} success={message} />

      {/* Group Sub-Customer Selector (Requirement 6) */}
      <div className="panel" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Layers size={18} color="#087f71" />
              Sub-Customer Extraction for Groups
            </h3>
            <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
              Individual packing lists itemized per sub-customer. Physical box consolidation can be done via Smart Transfer.
            </span>
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={fastTrackPackActiveGroup}
              disabled={busy || !activeGroup}
              style={{
                background: "#059669",
                color: "white",
                padding: "6px 14px",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.82rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                border: "none",
                cursor: "pointer",
                marginRight: "6px"
              }}
            >
              <Zap size={15} /> 1-Click Fast-Track All {activeGroup === "ALL" ? "Stores" : `${activeGroup} Stores`}
            </button>

            <Link
              href="/billing"
              style={{
                background: "#0f766e",
                color: "white",
                padding: "6px 14px",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.82rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                textDecoration: "none",
                marginRight: "10px"
              }}
            >
              <Receipt size={15} /> Next: Go to Billing →
            </Link>

            {["CT", "BE", "PTT", "ALL"].map(grp => (
              <button
                key={grp}
                type="button"
                onClick={() => loadGroupSubCustomers(grp)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  border: "1px solid",
                  cursor: "pointer",
                  background: activeGroup === grp ? "#087f71" : "#f1f5f9",
                  color: activeGroup === grp ? "white" : "#334155",
                  borderColor: activeGroup === grp ? "#087f71" : "#cbd5e1",
                }}
              >
                {grp === "ALL" ? "All Groups" : `${grp} Group`}
              </button>
            ))}
          </div>
        </div>

        {groupData && groupData.sub_customers.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
            {groupData.sub_customers.map(sc => (
              <button
                type="button"
                key={sc.client_order_id}
                onClick={() => loadPackingList(sc.client_order_id)}
                style={{
                  background: orderId === sc.client_order_id ? "#f0fdf4" : "#ffffff",
                  border: orderId === sc.client_order_id ? "2px solid #16a34a" : "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong style={{ color: "#0f172a", fontSize: "0.9rem" }}>
                    <Store size={14} style={{ display: "inline", marginRight: "4px" }} />
                    {sc.sub_customer_code}
                  </strong>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#087f71" }}>
                    {sc.total_estimated_net_weight_kg.toFixed(2)} kg
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "#64748b" }}>
                  <span>Ref: {sc.order_ref_id} · {sc.boxes_count} box(es)</span>
                  {sc.boxes && sc.boxes.length > 0 && sc.boxes[0].actual_net_weight_kg !== null ? (
                    <span style={{ fontSize: "0.7rem", background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                      ✓ Packed
                    </span>
                  ) : (
                    <span
                      onClick={(e) => { e.stopPropagation(); fastTrackPackOrder(sc.client_order_id); }}
                      style={{ fontSize: "0.7rem", background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px" }}
                    >
                      <Zap size={10} /> Auto-Pack
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
            Select a group or enter an Order UUID below to view and pack sub-customer boxes.
          </p>
        )}
      </div>

      {/* Stage Actions Toolbar */}
      <section className="panel" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "0.9rem", flex: 1, minWidth: "280px" }}>
            Active Order ID:
            <input
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              placeholder="Enter Client Order UUID"
              style={{ width: "100%", padding: "7px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
            />
          </label>
          <button
            type="button"
            onClick={() => loadPackingList(orderId)}
            disabled={busy || !orderId}
            style={{
              padding: "7px 16px",
              background: "#087f71",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Load Order
          </button>
        </div>

        {/* FAST-TRACK 1-CLICK AUTO-PACK (Template Driven) */}
        <div style={{ marginBottom: "14px" }}>
          <button
            type="button"
            onClick={() => fastTrackPackOrder()}
            disabled={busy || !orderId}
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: "10px",
              border: "1.5px solid #10b981",
              background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
              textAlign: "left",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, color: "#065f46", fontSize: "1rem" }}>
                <Zap size={20} color="#059669" /> ⚡ 1-Click Fast-Track Auto-Pack & Verify (Template Driven)
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#047857" }}>
                Populates packing manifests from customer template weights/pack counts, signs Handoff 02, and immediately unblocks Invoicing without floor scale entry.
              </p>
            </div>
            <span style={{ background: "#059669", color: "white", padding: "6px 16px", borderRadius: "6px", fontWeight: 700, fontSize: "0.85rem" }}>
              Fast-Track Active Order
            </span>
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          <button
            type="button"
            onClick={() => runAction("/packing/solve-design", { order_id: orderId })}
            disabled={busy || !orderId}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "white",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
              <Boxes size={18} color="#087f71" /> 1. Design Boxes
            </div>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Solve optimal packing constraints</span>
          </button>

          <button
            type="button"
            onClick={() => runAction(`/packing/orders/${orderId}/start-floor-packing`)}
            disabled={busy || !orderId}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              background: "white",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#0f172a" }}>
              <Play size={18} color="#3b82f6" /> 2. Start Floor Work
            </div>
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Enable weighing and item shifts</span>
          </button>

          <button
            type="button"
            onClick={() => setTransferModalOpen(true)}
            disabled={!packingData || packingData.boxes.length < 2}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #f59e0b",
              background: "#fffbeb",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#b45309" }}>
              <ArrowRightLeft size={18} color="#f59e0b" /> Smart Box Transfer
            </div>
            <span style={{ fontSize: "0.78rem", color: "#92400e" }}>Combine Small/Med into Large box</span>
          </button>

          <button
            type="button"
            onClick={() => runAction(`/packing/orders/${orderId}/confirm-final-pack`)}
            disabled={busy || !orderId}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #16a34a",
              background: "#f0fdf4",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#166534" }}>
              <LockKeyhole size={18} color="#16a34a" /> 3. Lock Final Pack
            </div>
            <span style={{ fontSize: "0.78rem", color: "#166534" }}>Freeze weights and make immutable</span>
          </button>

          <button
            type="button"
            onClick={returnHandoff02}
            disabled={handoffBusy || !orderId}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #7c3aed",
              background: "#f5f3ff",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#6d28d9" }}>
              <CheckCircle2 size={18} /> 4. Return Handoff 02
            </div>
            <span style={{ fontSize: "0.78rem", color: "#6d28d9" }}>Integrity-sign final locked packing</span>
          </button>

          <button
            type="button"
            onClick={triggerVehicleLoadExport}
            disabled={exportBusy}
            style={{
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #0284c7",
              background: "#f0f9ff",
              textAlign: "left",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "#0369a1" }}>
              <Truck size={18} color="#0284c7" /> 5. Export Vehicle Load
            </div>
            <span style={{ fontSize: "0.78rem", color: "#0284c7" }}>Double-check customer box totals</span>
          </button>
        </div>
      </section>

      {/* Packing Boxes Console */}
      {packingData ? (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ margin: 0 }}>
                Packing Slips for: {packingData.sub_customer_code} ({packingData.total_boxes_count} Boxes)
              </h2>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Order Ref: {packingData.order_ref_id} · Route: {packingData.route_code}
              </span>
            </div>

            {packingData.boxes && packingData.boxes.length > 0 && packingData.boxes.some(b => b.is_locked || b.actual_net_weight_kg !== null) && (
              <Link
                href={`/billing?orderId=${encodeURIComponent(packingData.client_order_id)}`}
                style={{
                  background: "#0f766e",
                  color: "white",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  textDecoration: "none",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                }}
              >
                <Receipt size={17} /> Proceed to Billing for this Order →
              </Link>
            )}
          </div>

          <div style={{ display: "grid", gap: "20px" }}>
            {packingData.boxes.map(box => (
              <div
                key={box.box_id}
                className="panel"
                style={{
                  border: box.is_locked ? "2px solid #16a34a" : "1px solid #cbd5e1",
                  background: box.is_locked ? "#fcfdfc" : "white"
                }}
              >
                {/* Box Header & STICKER FORMAT (Requirement 5) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{
                        background: "#087f71",
                        color: "white",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                        padding: "3px 10px",
                        borderRadius: "6px"
                      }}>
                        Box #{box.box_number}
                      </span>

                      {/* REQUIREMENT 5: ALPHANUMERIC BOX STICKER FORMAT */}
                      <span style={{
                        background: "#e0f2fe",
                        color: "#0369a1",
                        fontWeight: 800,
                        fontSize: "0.95rem",
                        padding: "3px 10px",
                        borderRadius: "6px",
                        letterSpacing: "0.5px"
                      }}>
                        <Tag size={14} style={{ display: "inline", marginRight: "4px" }} />
                        {box.sticker_label || `${packingData.route_code}-${packingData.sub_customer_code} / ${box.box_number} of ${packingData.total_boxes_count}`}
                      </span>

                      {box.is_locked && (
                        <span style={{
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px"
                        }}>
                          LOCKED
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "0.82rem", color: "#64748b" }}>
                      Net Weight (Template): <strong>{box.actual_net_weight_kg ? `${box.actual_net_weight_kg.toFixed(2)} kg` : "—"}</strong> · Gross Weight (with box tare): <strong>{box.actual_gross_weight_kg ? `${box.actual_gross_weight_kg.toFixed(2)} kg` : "—"}</strong>
                    </div>
                    {!box.is_locked && (
                      <div style={{ display: "flex", gap: "8px", alignItems: "end", flexWrap: "wrap", marginTop: "10px" }}>
                        <button
                          type="button"
                          onClick={() => fastTrackPackOrder(packingData.client_order_id)}
                          disabled={busy}
                          style={{
                            padding: "6px 14px",
                            background: "#059669",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <Zap size={14} /> ⚡ 1-Click Auto-Pack (Use Template Weights)
                        </button>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "auto 4px" }}>or override scale:</span>
                        <label style={{ fontSize: "0.76rem", fontWeight: 700 }}>
                          Scale net (kg)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={weightDrafts[box.box_id]?.net ?? ""}
                            onChange={event => setWeightDrafts(current => ({
                              ...current,
                              [box.box_id]: { ...current[box.box_id], net: event.target.value, gross: current[box.box_id]?.gross ?? "" },
                            }))}
                            style={{ display: "block", width: "110px", padding: "5px 8px", marginTop: "3px" }}
                          />
                        </label>
                        <label style={{ fontSize: "0.76rem", fontWeight: 700 }}>
                          Scale gross (kg)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={weightDrafts[box.box_id]?.gross ?? ""}
                            onChange={event => setWeightDrafts(current => ({
                              ...current,
                              [box.box_id]: { ...current[box.box_id], gross: event.target.value, net: current[box.box_id]?.net ?? "" },
                            }))}
                            style={{ display: "block", width: "110px", padding: "5px 8px", marginTop: "3px" }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => saveBoxWeights(box.box_id)}
                          disabled={busy}
                          style={{ padding: "6px 12px", border: 0, borderRadius: "6px", background: "#087f71", color: "white", fontWeight: 700 }}
                        >
                          Save verified weights
                        </button>
                      </div>
                    )}
                  </div>

                  {/* REQUIREMENT 3: DROP-DOWN MENU FOR BOX SIZING */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#334155" }}>
                      Box Size:
                      <select
                        value={box.box_type_name}
                        disabled={box.is_locked}
                        onChange={e => {
                          const cat = boxCatalogues.find(c => c.size_name === e.target.value);
                          if (cat) changeBoxSize(box.box_id, cat.id);
                        }}
                        style={{
                          marginLeft: "6px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontWeight: 700,
                          color: "#087f71"
                        }}
                      >
                        <option value="Small">Small (38x28x34)</option>
                        <option value="Medium">Medium (30x40x30)</option>
                        <option value="Large">Large (46x34x36)</option>
                        <option value="Giant">Giant (60x44x30)</option>
                        <option value="Flat">Flat (54x42x21)</option>
                        <option value="Custom">Custom Carton</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => setPreviewBox(box)}
                      style={{
                        padding: "5px 10px",
                        background: "#f1f5f9",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                    >
                      <QrCode size={14} /> Sticker
                    </button>
                  </div>
                </div>

                {/* Box Items Table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", color: "#64748b", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>SKU Code</th>
                      <th style={{ padding: "6px 8px" }}>Produce Item</th>
                      <th style={{ padding: "6px 8px" }}>Pack Size</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Packed Count</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Net Wt (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {box.items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: "#087f71" }}>{item.product_code}</td>
                        <td style={{ padding: "6px 8px" }}>{item.produce_name}</td>
                        <td style={{ padding: "6px 8px", color: "#64748b" }}>{item.pack_size}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{item.packed_count} packs</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{item.net_weight_kg.toFixed(2)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel" style={{ textAlign: "center", padding: "40px" }}>
          <Boxes size={40} color="#94a3b8" style={{ margin: "0 auto 12px" }} />
          <h3>No Sub-Customer Packing List Loaded</h3>
          <p style={{ color: "var(--muted)", maxWidth: "480px", margin: "0 auto 16px" }}>
            Select an itemized sub-customer from the CT/BE Group list above, or input a Client Order ID.
          </p>
        </div>
      )}

      {/* SMART ITEM TRANSFER MODAL (Requirement 3) */}
      {transferModalOpen && packingData && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.6)",
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
            maxWidth: "500px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <ArrowRightLeft color="#087f71" size={20} />
                Smart Box Transfer & Merging
              </h3>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 16px" }}>
              Combine remaining produce items from smaller boxes into a larger box. SKUs and weights are transferred automatically without manual re-typing.
            </p>

            <form onSubmit={handleTransferContents} style={{ display: "grid", gap: "16px" }}>
              <label style={{ display: "grid", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                From Source Box (Items to transfer out):
                <select
                  value={sourceBoxId}
                  onChange={e => setSourceBoxId(e.target.value)}
                  required
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                >
                  <option value="">-- Select Source Box --</option>
                  {packingData.boxes.map(b => (
                    <option key={b.box_id} value={b.box_id}>
                      Box #{b.box_number} ({b.box_type_name} · {b.items.length} items · {b.actual_net_weight_kg || 0} kg)
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Into Target Box (Larger Combined Box):
                <select
                  value={targetBoxId}
                  onChange={e => setTargetBoxId(e.target.value)}
                  required
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                >
                  <option value="">-- Select Target Box --</option>
                  {packingData.boxes.map(b => (
                    <option key={b.box_id} value={b.box_id}>
                      Box #{b.box_number} ({b.box_type_name} · {b.items.length} items)
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={removeEmptySource}
                  onChange={e => setRemoveEmptySource(e.target.checked)}
                />
                Remove source box after all items are transferred
              </label>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#f1f5f9",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferBusy || !sourceBoxId || !targetBoxId}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#087f71",
                    color: "white",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {transferBusy ? "Transferring…" : "Transfer Items to Target Box"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BOX TRANSPORTATION EXPORT FILE MODAL (Requirement 4) */}
      {vehicleExport && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.6)",
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
            maxWidth: "600px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "1.1rem" }}>
                <Truck color="#087f71" size={22} />
                Vehicle Loading & Box Totals Checkpoint
              </div>
              <button
                type="button"
                onClick={() => setVehicleExport(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 16px" }}>
              Double-check box totals per customer before placing boxes into the delivery vehicle:
            </p>

            {/* Customer Box Totals List */}
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", maxHeight: "240px", overflowY: "auto", marginBottom: "16px" }}>
              {vehicleExport.customers.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #e2e8f0",
                    fontSize: "0.9rem"
                  }}
                >
                  <strong>{c.customer_code}: {c.boxes_count} boxes</strong>
                  <span style={{ color: "#64748b", fontSize: "0.82rem" }}>
                    Boxes: #{c.box_numbers.join(", #")} ({c.total_net_kg.toFixed(2)} kg)
                  </span>
                </div>
              ))}
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px", marginBottom: "16px", fontWeight: 700, color: "#166534" }}>
              Total Vehicle Load: {vehicleExport.total_boxes_count} boxes · Gross Weight: {vehicleExport.total_gross_weight_kg.toFixed(2)} kg
            </div>

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setVehicleExport(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "#f1f5f9",
                  cursor: "pointer"
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={downloadExportFile}
                style={{
                  padding: "8px 18px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#087f71",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Download size={16} /> Download Vehicle Load Check (.CSV)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STICKER PRINT PREVIEW MODAL (Requirement 5) */}
      {previewBox && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.6)",
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
            maxWidth: "400px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            textAlign: "center"
          }}>
            <h3 style={{ margin: "0 0 16px" }}>Box QR Code & Shipping Sticker</h3>

            {/* STICKER PREVIEW BOX */}
            <div className="print-sticker" style={{
              border: "3px dashed #0f172a",
              borderRadius: "12px",
              padding: "20px",
              background: "#fafafa",
              marginBottom: "16px"
            }}>
              {/* REQUIREMENT 5: STICKER FORMAT: [Main]-[Sub] / [Box X] of [Total] */}
              <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#0f172a", letterSpacing: "0.5px", marginBottom: "8px" }}>
                {previewBox.sticker_label}
              </div>

              <div style={{
                width: "140px",
                height: "140px",
                margin: "0 auto 12px",
                background: "white",
                border: "2px solid #0f172a",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {previewQrDataUrl ? (
                  <Image unoptimized src={previewQrDataUrl} alt={`QR code for ${previewBox.sticker_label}`} width={136} height={136} />
                ) : (
                  <QrCode size={90} color="#0f172a" />
                )}
              </div>

              <div style={{ fontSize: "0.85rem", color: "#334155" }}>
                Size: <strong>{previewBox.box_type_name}</strong> · Net Wt: <strong>{previewBox.actual_net_weight_kg || 0} kg</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button type="button" onClick={() => window.print()} className="primary-button">Print sticker</button>
              <button
                type="button"
                onClick={() => setPreviewBox(null)}
                style={{
                  padding: "8px 24px",
                  background: "#475569",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
