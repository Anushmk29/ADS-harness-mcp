"use client";

import { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  Split,
  MessageSquarePlus,
  Store,
  ArrowRight,
  AlertTriangle,
  X,
  PlusCircle,
  FileCheck,
  Download,
  FileDown,
  Layers,
  HelpCircle,
  Search
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

type SubCustomerDetail = {
  client_code: string;
  route_group: string;
  sheets: string[];
};

type UnresolvedProduct = {
  product_code: string;
  name_vi?: string;
  name_en?: string;
  pack_size?: string;
  display_name?: string;
};

type MasterProduct = {
  id: string;
  t_code: string;
  name_vi: string;
  name_en: string;
};

type MainCustomer = {
  id: string;
  client_code: string;
  company_name: string;
  is_main_customer: boolean;
};

type ValidationResponse = {
  unresolved: UnresolvedProduct[];
  can_split: boolean;
};

type Ack = {
  raw_file_id: string;
  file_name: string;
  main_customer_id?: string;
  total_sub_customers_detected: number;
  sub_customer_codes: string[];
  sheets_detected: Array<{ sheet_name: string; sub_customer_count: number }>;
  group_summary?: Record<string, number>;
  sub_customer_details?: SubCustomerDetail[];
  unresolved_products?: UnresolvedProduct[];
  can_split?: boolean;
  verification_notice: string;
  status: string;
};

type SplitResponse = {
  raw_file_id: string;
  status: string;
  total_client_orders_created: number;
  total_line_items_created: number;
  total_estimated_weight_kg: number;
  sample_orders: Array<{
    order_ref_id: string;
    client_code: string;
    items_count: number;
    estimated_net_weight_kg: number;
  }>;
};

export default function OrdersPage() {
  const [file, setFile] = useState<File>();
  const [shipmentDate, setShipmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [route, setRoute] = useState("TETE");
  const [result, setResult] = useState<Ack>();
  const [splitResult, setSplitResult] = useState<SplitResponse>();
  const [unresolved, setUnresolved] = useState<UnresolvedProduct[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [mainCustomers, setMainCustomers] = useState<MainCustomer[]>([]);
  const [mainCustomerId, setMainCustomerId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>("ALL");
  const [showGuide, setShowGuide] = useState(false);

  // Missing SKU Quick-Mapping Modal State
  const [mappingModalItem, setMappingModalItem] = useState<UnresolvedProduct | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [mappingMode, setMappingMode] = useState<"select" | "create">("select");
  const [newCode, setNewCode] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newNameVi, setNewNameVi] = useState("");
  const [newNameTh, setNewNameTh] = useState("");
  const [newProduceType, setNewProduceType] = useState("LEAFY");
  const [newBoxMaterial, setNewBoxMaterial] = useState("FOAM");
  const [newTemperature, setNewTemperature] = useState("COLD");
  const [newWeightClass, setNewWeightClass] = useState("LIGHT");
  const [newControlStatus, setNewControlStatus] = useState("COMBINABLE");
  const [newPackSize, setNewPackSize] = useState("100g");

  // Ad-hoc WhatsApp order state
  const [adhocCustomer, setAdhocCustomer] = useState("");
  const [adhocProduct, setAdhocProduct] = useState("");
  const [adhocPackSize, setAdhocPackSize] = useState("100g");
  const [adhocQty, setAdhocQty] = useState(10);
  const [adhocBusy, setAdhocBusy] = useState(false);

  useEffect(() => {
    api<MainCustomer[]>("/master-data/customers?main_only=true")
      .then(customers => {
        setMainCustomers(customers || []);
        if (customers.length === 1) setMainCustomerId(customers[0].id);
      })
      .catch(reason => {
        setMainCustomers([]);
        setMainCustomerId("");
        setError(reason instanceof Error ? reason.message : "Failed to load customer data");
      });
  }, []);

  useEffect(() => {
    if (!mappingModalItem) return;
    const timer = window.setTimeout(() => {
      const query = productSearch.trim()
        ? `?q=${encodeURIComponent(productSearch.trim())}&limit=100`
        : "?limit=100";
      api<MasterProduct[]>(`/master-data/products${query}`)
        .then(products => {
          setMasterProducts(products || []);
          setMappingError("");
        })
        .catch(reason => {
          setMasterProducts([]);
          setMappingError(reason instanceof Error ? reason.message : "Failed to load the product catalogue");
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mappingModalItem, productSearch]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setSplitResult(undefined);

    const body = new FormData();
    body.set("file", file);
    body.set("shipment_date", shipmentDate);
    body.set("route_line", route);
    body.set("main_customer_id", mainCustomerId);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isMultiModal = ["pdf", "png", "jpg", "jpeg", "xls"].includes(ext);

    try {
      if (isMultiModal) {
        const universalRes = await api<{
          message: string;
          raw_file_id: string;
          file_name: string;
          channel: string;
          total_sub_customers_detected: number;
          created_orders_count: number;
          total_items_processed: number;
          matched_items_count: number;
          unmatched_items_count: number;
          match_rate_percentage: number;
          total_net_weight_kg: number;
          procurement_consolidated_skus: number;
        }>("/orders/upload-universal", { method: "POST", body });

        setSuccess(`✓ Ingestion Success: ${universalRes.file_name} (${universalRes.channel}). Detected ${universalRes.total_sub_customers_detected} customer(s), created ${universalRes.created_orders_count} atomic order(s) (${universalRes.total_net_weight_kg.toFixed(2)} kg net, ${universalRes.match_rate_percentage}% SKU match).`);
      } else {
        const ack = await api<Ack>("/orders/upload-matrix", { method: "POST", body });
        setResult(ack);
        setActiveGroup("ALL");
        setUnresolved(ack.unresolved_products || []);
        setSuccess(`Matrix inspected: ${ack.total_sub_customers_detected} sub-customers discovered. Run validation before splitting.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload inspection failed");
    } finally {
      setBusy(false);
    }
  }

  function openMappingModal(item: UnresolvedProduct) {
    setMappingModalItem(item);
    setMappingMode("select");
    setSelectedProductId("");
    setMappingError("");
    const searchHint = item.product_code || item.name_vi || item.name_en || "";
    setProductSearch(searchHint);
    setNewCode(item.product_code || "");
    setNewNameEn(item.name_en || item.display_name || "");
    setNewNameVi(item.name_vi || "");
    setNewNameTh("");
    setNewProduceType("LEAFY");
    setNewBoxMaterial("FOAM");
    setNewTemperature("COLD");
    setNewWeightClass("LIGHT");
    setNewControlStatus("COMBINABLE");
    setNewPackSize(item.pack_size || "100g");
  }

  async function quickMapSku(event: React.FormEvent) {
    event.preventDefault();
    if (!mappingModalItem || !selectedProductId) return;
    setMappingBusy(true);
    setMappingError("");

    try {
      const rawText = mappingModalItem.name_vi || mappingModalItem.name_en || mappingModalItem.product_code;
      await api("/master-data/sku-mappings", {
        method: "POST",
        body: JSON.stringify({
          main_customer_id: result?.main_customer_id,
          client_sku_code: mappingModalItem.product_code,
          client_raw_name: rawText,
          product_id: selectedProductId,
          standard_pack_size: mappingModalItem.pack_size || "100g"
        })
      });

      // Remove from missing list
      setUnresolved(prev => prev.filter(i => i.product_code !== mappingModalItem.product_code));
      setSuccess(`✓ Successfully mapped '${mappingModalItem.product_code}'!`);
      setMappingModalItem(null);
      setSelectedProductId("");
    } catch (reason) {
      setMappingError(reason instanceof Error ? reason.message : "SKU mapping failed");
    } finally {
      setMappingBusy(false);
    }
  }

  async function createAndMapNewProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!mappingModalItem) return;
    if (!newCode.trim()) {
      setMappingError("Product SKU code is required");
      return;
    }
    if (!newNameEn.trim() && !newNameVi.trim()) {
      setMappingError("Please provide at least one produce name (English or Vietnamese)");
      return;
    }

    setMappingBusy(true);
    setMappingError("");

    try {
      // 1. Create the new Master Product in catalogue
      const created = await api<MasterProduct>("/master-data/products", {
        method: "POST",
        body: JSON.stringify({
          t_code: newCode.trim().toUpperCase(),
          name_en: newNameEn.trim(),
          name_vi: newNameVi.trim(),
          name_th: newNameTh.trim(),
          produce_type: newProduceType,
          box_material: newBoxMaterial,
          temperature: newTemperature,
          weight_class: newWeightClass,
          control_status: newControlStatus,
          default_pack_sizes: [newPackSize.trim() || "100g"],
        })
      });

      // 2. Link client's raw SKU & text to this newly created Master Product
      const rawText = mappingModalItem.name_vi || mappingModalItem.name_en || mappingModalItem.product_code;
      await api("/master-data/sku-mappings", {
        method: "POST",
        body: JSON.stringify({
          main_customer_id: result?.main_customer_id,
          client_sku_code: mappingModalItem.product_code,
          client_raw_name: rawText,
          product_id: created.id,
          standard_pack_size: newPackSize || mappingModalItem.pack_size || "100g",
        })
      });

      // 3. Add to local master product state so it's instantly available everywhere
      setMasterProducts(prev => [created, ...prev.filter(p => p.id !== created.id)]);

      // 4. Remove this item from unresolved missing list
      setUnresolved(prev => prev.filter(i => i.product_code !== mappingModalItem.product_code));
      setSuccess(`✓ Successfully created master SKU '${created.t_code} · ${created.name_en || created.name_vi}' and verified mapping!`);
      setMappingModalItem(null);
      setSelectedProductId("");
    } catch (reason) {
      setMappingError(reason instanceof Error ? reason.message : "Failed to create master product and link mapping");
    } finally {
      setMappingBusy(false);
    }
  }

  async function authorizeAndSplit() {
    if (!result) return;
    if (unresolved.length > 0) {
      setError(`Cannot split: ${unresolved.length} missing SKUs remain unmapped. Please map all highlighted red items first.`);
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const validation = await api<ValidationResponse>(`/orders/${result.raw_file_id}/validate`, { method: "GET" });
      setUnresolved(validation.unresolved || []);
      if (!validation.can_split) {
        setError(`Cannot split: ${validation.unresolved.length} missing SKUs remain unmapped. Map every highlighted item, then validate again.`);
        return;
      }

      const res = await api<SplitResponse>(`/orders/${result.raw_file_id}/split`, { method: "POST" });
      setSplitResult(res);
      setSuccess(`Success! ${res.total_client_orders_created} atomic sub-customer orders created (${res.total_estimated_weight_kg} kg).`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Splitting orders failed");
    } finally {
      setBusy(false);
    }
  }

  async function addAdhocItem(event: React.FormEvent) {
    event.preventDefault();
    if (!result || !adhocCustomer || !adhocProduct) return;
    setAdhocBusy(true);
    setError("");
    setSuccess("");

    try {
      const res = await api<{ message: string; customer_code: string }>(
        `/orders/${result.raw_file_id}/add-adhoc-order`,
        {
          method: "POST",
          body: JSON.stringify({
            client_code: adhocCustomer,
            source_notes: "WhatsApp Chat Ingestion",
            items: [{
              t_code: adhocProduct,
              name: adhocProduct,
              pack_size: adhocPackSize,
              pack_count: Number(adhocQty),
            }],
          })
        }
      );
      setSuccess(`💬 WhatsApp Order Attached: ${res.message}`);
      setAdhocProduct("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to add WhatsApp order item");
    } finally {
      setAdhocBusy(false);
    }
  }

  // Filtered sub-customers by route group
  const details = result?.sub_customer_details || [];
  const groups = result?.group_summary || {};
  const groupKeys = Object.keys(groups).sort();

  const filteredShops = activeGroup === "ALL" 
    ? (result?.sub_customer_codes || [])
    : details.filter(d => d.route_group === activeGroup).map(d => d.client_code);

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Stage 01 · Intake & Order Splitting</p>
        <h1>Order Intake & Group Verification</h1>
        <p>Dynamic Floating Anchor automatically recognizes route groups, sub-orders, and WhatsApp additions.</p>
      </header>

      {/* Standard Intake & Group Verification Templates Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)",
          border: "1px solid #a7f3d0",
          borderRadius: "14px",
          padding: "16px 20px",
          marginBottom: "22px",
          display: "grid",
          gap: "12px",
          boxShadow: "0 2px 6px -1px rgba(0, 0, 0, 0.04)"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#d1fae5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#059669",
              }}
            >
              <FileDown size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ fontSize: "1rem", color: "#064e3b" }}>
                  Download Standard Order Templates
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    background: "#059669",
                    color: "white",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    letterSpacing: "0.04em",
                  }}
                >
                  OFFICIAL FORMATS
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#047857" }}>
                Pre-configured Excel templates for Group Verification (multi-shop route matrices) or Single Customer POs.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <a
              href="/templates/Group_Order_Matrix_Template.xlsx"
              download="Group_Order_Matrix_Template.xlsx"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                background: "#059669",
                color: "#ffffff",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
              title="Download Group Order Matrix (Multi-Client Route Groups)"
            >
              <Download size={15} />
              <span>Group Matrix Template (.xlsx)</span>
            </a>

            <a
              href="/templates/Single_Customer_Order_Template.xlsx"
              download="Single_Customer_Order_Template.xlsx"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                background: "#0891b2",
                color: "#ffffff",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
              }}
              title="Download Single Customer Order Template"
            >
              <Download size={15} />
              <span>Single Customer Template (.xlsx)</span>
            </a>

            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                background: "white",
                border: "1px solid #cbd5e1",
                color: "#334155",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <HelpCircle size={15} color="#0891b2" />
              <span>{showGuide ? "Hide Format Guide" : "Format Guide"}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Format Guide */}
        {showGuide && (
          <div
            style={{
              marginTop: "8px",
              paddingTop: "12px",
              borderTop: "1px solid #a7f3d0",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "14px",
              fontSize: "0.82rem",
              color: "#1e293b",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.85)",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "#065f46", marginBottom: "6px" }}>
                <Layers size={15} />
                <span>Group Order Matrix Specification</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "#334155" }}>
                <li><strong>Row 2 (Route Groups):</strong> Top header merges indicating route group (e.g. <code>Group CT</code>, <code>Group BE</code>, <code>Group NGA</code>).</li>
                <li><strong>Row 3 (Client Codes):</strong> Individual sub-customer shops (e.g. <code>CT-Trung</code>, <code>BE-DUYÊN</code>).</li>
                <li><strong>Cols A–D (Produce):</strong> <code>Code</code>, <code>VIET DESCRIPTION</code>, <code>ENGLISH DESCRIPTION</code>, and <code>Packing</code>.</li>
                <li><strong>Intersection Cells:</strong> Enter numeric pack counts per shop. Row & column totals auto-compute.</li>
              </ul>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.85)",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "#0e7490", marginBottom: "6px" }}>
                <FileSpreadsheet size={15} />
                <span>Single Customer PO Specification</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: "18px", display: "grid", gap: "4px", color: "#334155" }}>
                <li><strong>Header Rows:</strong> Contains <code>Order Info</code> sheet with Customer Code, Shipment Date, and Route line.</li>
                <li><strong>Order Sheet:</strong> Contains standard columns: <code>Code</code>, <code>Product Name</code>, <code>Viet</code>, <code>Thai</code>, <code>Packing</code>, <code>Order</code>.</li>
                <li><strong>Automated Calculation:</strong> Multiplies pack count by standard pack weight (e.g. 100g = 0.10 kg) for instant net weights.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <StatusMessage error={error} success={success} />

      <div className="two-column">
        {/* LEFT COLUMN: Upload & Actions */}
        <div style={{ display: "grid", gap: "20px" }}>
          <form className="panel form-panel" onSubmit={upload}>
            <div className="section-heading">
              <div>
                <h2>Universal Order Intake</h2>
                <p>Excel matrices, shop sheets (19T/68H), PDF POs, or chat screenshots</p>
              </div>
              <FileSpreadsheet />
            </div>

            <label className="file-drop">
              <Upload />
              <strong>{file?.name ?? "Choose an order file or screenshot"}</strong>
              <span>Drop Excel (.xlsx, .xls), PDF PO, or Chat Image (.png, .jpg)</span>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm,.pdf,.png,.jpg,.jpeg"
                onChange={e => setFile(e.target.files?.[0])}
                required
              />
            </label>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.8rem",
                color: "#64748b",
                margin: "-8px 0 10px",
                padding: "0 4px",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span>Need the official format?</span>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <a
                  href="/templates/Group_Order_Matrix_Template.xlsx"
                  download="Group_Order_Matrix_Template.xlsx"
                  style={{
                    color: "#059669",
                    fontWeight: 600,
                    textDecoration: "underline",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Download size={12} /> Group Matrix (.xlsx)
                </a>
                <span style={{ color: "#cbd5e1" }}>·</span>
                <a
                  href="/templates/Single_Customer_Order_Template.xlsx"
                  download="Single_Customer_Order_Template.xlsx"
                  style={{
                    color: "#0891b2",
                    fontWeight: 600,
                    textDecoration: "underline",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <Download size={12} /> Single Order (.xlsx)
                </a>
              </div>
            </div>

            <div className="field-row">
              <label>
                Main Customer Account
                <select value={mainCustomerId} onChange={e => setMainCustomerId(e.target.value)} required>
                  <option value="">Select the billing customer</option>
                  {mainCustomers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.client_code} · {customer.company_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Shipment target date
                <input type="date" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)} required />
              </label>
              <label>
                Route Line
                <select value={route} onChange={e => setRoute(e.target.value)}>
                  <option>TETE</option>
                  <option>NGA</option>
                  <option>FR</option>
                  <option>DE</option>
                  <option>UK</option>
                </select>
              </label>
            </div>

            <button className="primary-button" disabled={busy}>
              {busy ? "Inspecting Floating Anchors…" : "Upload & Inspect Matrix"}
            </button>
          </form>

          {/* Ad-Hoc WhatsApp Order Panel */}
          {result && (
            <form className="panel form-panel" onSubmit={addAdhocItem} style={{ borderTop: "3px solid #087f71" }}>
              <div className="section-heading">
                <div>
                  <h2>💬 Ingest WhatsApp / Chat Order</h2>
                  <p>Add ad-hoc orders (e.g. from WhatsApp screenshot 1.1.png)</p>
                </div>
                <MessageSquarePlus color="#087f71" />
              </div>

              <div className="field-row">
                <label>
                  Sub-Customer Shop
                  <input
                    list="shops-datalist"
                    placeholder="e.g. BE-DUYÊN or CT-Trung"
                    value={adhocCustomer}
                    onChange={e => setAdhocCustomer(e.target.value)}
                    required
                  />
                  <datalist id="shops-datalist">
                    {result.sub_customer_codes.map(c => <option key={c} value={c} />)}
                  </datalist>
                </label>

                <label>
                  Produce Item (Code or Name)
                  <input
                    placeholder="e.g. T024, Sweet basil, Chaplu leaf"
                    value={adhocProduct}
                    onChange={e => setAdhocProduct(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="field-row">
                <label>
                  Pack Size
                  <select value={adhocPackSize} onChange={e => setAdhocPackSize(e.target.value)}>
                    <option value="100g">100g</option>
                    <option value="200g">200g</option>
                    <option value="500g">500g</option>
                    <option value="1kg">1kg</option>
                  </select>
                </label>

                <label>
                  Quantity (Packs)
                  <input
                    type="number"
                    min="1"
                    value={adhocQty}
                    onChange={e => setAdhocQty(Number(e.target.value))}
                    required
                  />
                </label>
              </div>

              <button className="primary-button" style={{ background: "#0f766e" }} disabled={adhocBusy}>
                {adhocBusy ? "Adding to Order…" : "+ Attach Chat Order to Shipment"}
              </button>
            </form>
          )}
        </div>

        {/* RIGHT COLUMN: Group Accordion, Missing SKU Alert & Verification */}
        <section className="panel result-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <p className="eyebrow">Human Verification Checkpoint</p>
              <h2>
                {result ? `${result.total_sub_customers_detected} Sub-Customers Detected` : "Awaiting Workbook Upload"}
              </h2>
            </div>

            {result && !splitResult && (
              <button
                onClick={authorizeAndSplit}
                disabled={busy || unresolved.length > 0}
                className="primary-button"
                style={{
                  background: unresolved.length > 0 ? "#94a3b8" : "#16a34a",
                  minHeight: "38px",
                  fontSize: "0.85rem",
                  cursor: unresolved.length > 0 ? "not-allowed" : "pointer"
                }}
              >
                <Split size={16} /> {busy ? "Splitting…" : unresolved.length > 0 ? `Map ${unresolved.length} Missing SKUs First` : "Authorize & Split Orders"}
              </button>
            )}
          </div>

          {result ? (
            <div style={{ marginTop: "16px", display: "grid", gap: "18px" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>
                {result.verification_notice}
              </p>

              {/* REQUIREMENT 1: MISSING SKU HIGHLIGHTING (DISTINCT RED ALERT) */}
              {unresolved.length > 0 && (
                <div style={{
                  background: "#fef2f2",
                  border: "2px solid #ef4444",
                  borderRadius: "12px",
                  padding: "16px",
                  color: "#991b1b"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "0.95rem" }}>
                    <AlertTriangle color="#dc2626" size={20} />
                    <span>⚠️ Missing SKU Alert: {unresolved.length} Produce Items Need Mapping</span>
                  </div>
                  <p style={{ margin: "6px 0 12px", fontSize: "0.82rem", color: "#b91c1c" }}>
                    The items below do not match any existing SKU in the database. They are highlighted in red to alert staff to map them before splitting orders:
                  </p>

                  <div style={{ display: "grid", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
                    {unresolved.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "white",
                          border: "1px solid #f87171",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <span style={{
                            background: "#fee2e2",
                            color: "#b91c1c",
                            fontWeight: 700,
                            fontSize: "0.72rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            marginRight: "8px"
                          }}>
                            MISSING SKU
                          </span>
                          <strong style={{ color: "#1e293b", fontSize: "0.88rem" }}>
                            {item.product_code} {item.name_vi ? `· ${item.name_vi}` : ""} {item.name_en ? `(${item.name_en})` : ""}
                          </strong>
                          <span style={{ color: "#64748b", fontSize: "0.78rem", marginLeft: "6px" }}>
                            [{item.pack_size || "100g"}]
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openMappingModal(item)}
                          style={{
                            background: "#dc2626",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            padding: "5px 11px",
                            fontSize: "0.78rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          <PlusCircle size={14} /> Map SKU
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Group Filter Tabs (Parent Groups like CT Group, BE Group) */}
              {groupKeys.length > 0 && (
                <div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "8px" }}>
                    Route Groups & Parent Clusters:
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setActiveGroup("ALL")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "8px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        border: "1px solid",
                        cursor: "pointer",
                        background: activeGroup === "ALL" ? "#087f71" : "#f1f5f9",
                        color: activeGroup === "ALL" ? "white" : "#334155",
                        borderColor: activeGroup === "ALL" ? "#087f71" : "#cbd5e1",
                      }}
                    >
                      All ({result.total_sub_customers_detected})
                    </button>
                    {groupKeys.map(grp => (
                      <button
                        key={grp}
                        type="button"
                        onClick={() => setActiveGroup(grp)}
                        style={{
                          padding: "5px 11px",
                          borderRadius: "8px",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          border: "1px solid",
                          cursor: "pointer",
                          background: activeGroup === grp ? "#087f71" : "#f8fbfa",
                          color: activeGroup === grp ? "white" : "#334155",
                          borderColor: activeGroup === grp ? "#087f71" : "#cbd8d5",
                        }}
                      >
                        {grp} ({groups[grp]})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtered Sub-Customer Code Pills */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    Showing {filteredShops.length} sub-customers itemized under {activeGroup}:
                  </span>
                </div>
                <div className="code-cloud" style={{ marginTop: "4px" }}>
                  {filteredShops.map(code => (
                    <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Store size={12} /> {code}
                    </span>
                  ))}
                </div>
              </div>

              {/* Split Results Banner */}
              {splitResult && (
                <div style={{ padding: "16px", borderRadius: "12px", background: "#f0fdf4", border: "1px solid #bbf7d0", marginTop: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", fontWeight: 700, marginBottom: "8px" }}>
                    <CheckCircle2 size={18} />
                    Orders Successfully Split & Ready for Wholesale Procurement
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontSize: "0.82rem", color: "#1e293b", marginBottom: "12px" }}>
                    <div><strong>Client Orders:</strong> {splitResult.total_client_orders_created}</div>
                    <div><strong>Line Items:</strong> {splitResult.total_line_items_created}</div>
                    <div><strong>Estimated Weight:</strong> {splitResult.total_estimated_weight_kg} kg</div>
                  </div>

                  <Link
                    href="/procurement"
                    className="primary-button"
                    style={{ background: "#166534", textDecoration: "none", minHeight: "40px", fontSize: "0.85rem" }}
                  >
                    Proceed to Wholesale Procurement <ArrowRight size={16} />
                  </Link>
                </div>
              )}

              <p className="record-id" style={{ marginTop: "10px" }}>
                Raw Matrix ID: {result.raw_file_id}
              </p>
            </div>
          ) : (
            <div style={{ marginTop: "16px", display: "grid", gap: "16px" }}>
              <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: 0 }}>
                Upload your customer order workbook. The system will automatically detect floating headers, group sheets, itemize sub-customers, and verify produce SKUs.
              </p>

              <div
                style={{
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  borderRadius: "12px",
                  padding: "18px",
                  display: "grid",
                  gap: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "0.92rem", color: "#1e293b" }}>
                  <Layers size={18} color="#059669" />
                  <span>Downloadable Templates for Intake & Verification</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
                  To ensure 100% SKU auto-match and instant group discovery, you can distribute or fill out the pre-validated templates below:
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <a
                    href="/templates/Group_Order_Matrix_Template.xlsx"
                    download="Group_Order_Matrix_Template.xlsx"
                    style={{
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "12px",
                      textDecoration: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.72rem", background: "#d1fae5", color: "#065f46", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        MULTI-SHOP
                      </span>
                      <Download size={14} color="#059669" />
                    </div>
                    <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>Group Order Matrix</strong>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Contains route grouping, floating headers, and sub-customer shops.
                    </span>
                    <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "#059669", marginTop: "4px" }}>
                      Download .xlsx (42 KB) ↓
                    </span>
                  </a>

                  <a
                    href="/templates/Single_Customer_Order_Template.xlsx"
                    download="Single_Customer_Order_Template.xlsx"
                    style={{
                      background: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "12px",
                      textDecoration: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.72rem", background: "#ecfeff", color: "#0e7490", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        SINGLE SHOP
                      </span>
                      <Download size={14} color="#0891b2" />
                    </div>
                    <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>Single Customer PO</strong>
                    <span style={{ fontSize: "0.76rem", color: "#64748b" }}>
                      Standard purchase order with SKU codes, pack weights, and multilingual names.
                    </span>
                    <span style={{ fontSize: "0.76rem", fontWeight: 600, color: "#0891b2", marginTop: "4px" }}>
                      Download .xlsx (33 KB) ↓
                    </span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* QUICK MAP SKU MODAL */}
      {mappingModalItem && (
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
            maxWidth: "540px",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "1.1rem" }}>
                <FileCheck color="#087f71" size={22} />
                Map Produce to Master SKU
              </div>
              <button
                type="button"
                onClick={() => setMappingModalItem(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Produce item context */}
            <div style={{
              background: "#f8fafc",
              padding: "12px 14px",
              borderRadius: "10px",
              fontSize: "0.84rem",
              border: "1px solid #e2e8f0",
              marginBottom: "14px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span><strong>Workbook Code:</strong> <span style={{ color: "#0f766e", fontWeight: 700 }}>{mappingModalItem.product_code}</span></span>
                <span><strong>Pack Size:</strong> {mappingModalItem.pack_size || "100g"}</span>
              </div>
              <div><strong>Detected Text:</strong> {mappingModalItem.name_vi || mappingModalItem.name_en || mappingModalItem.display_name || "—"}</div>
            </div>

            {/* Mode Selector Tabs */}
            <div style={{ display: "flex", gap: "6px", background: "#f1f5f9", padding: "4px", borderRadius: "10px", marginBottom: "14px" }}>
              <button
                type="button"
                onClick={() => { setMappingMode("select"); setMappingError(""); }}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: mappingMode === "select" ? "white" : "transparent",
                  color: mappingMode === "select" ? "#0f766e" : "#64748b",
                  boxShadow: mappingMode === "select" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Search size={14} /> Select Existing Master SKU
              </button>
              <button
                type="button"
                onClick={() => { setMappingMode("create"); setMappingError(""); }}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  background: mappingMode === "create" ? "white" : "transparent",
                  color: mappingMode === "create" ? "#0f766e" : "#64748b",
                  boxShadow: mappingMode === "create" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <PlusCircle size={14} /> + Create New Master Product
              </button>
            </div>

            {mappingMode === "select" ? (
              /* TAB 1: SEARCH & LINK TO EXISTING PRODUCT */
              <form onSubmit={quickMapSku} style={{ display: "grid", gap: "14px" }}>
                <StatusMessage error={mappingError} />

                <label style={{ display: "grid", gap: "6px", fontSize: "0.84rem", fontWeight: 600 }}>
                  Search Master Catalogue:
                  <div style={{ position: "relative" }}>
                    <input
                      value={productSearch}
                      onChange={event => setProductSearch(event.target.value)}
                      placeholder="Search code, EN, VI, or TH name..."
                      style={{
                        width: "100%",
                        padding: "9px 12px 9px 34px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        boxSizing: "border-box",
                        fontSize: "0.88rem",
                      }}
                    />
                    <Search size={16} color="#94a3b8" style={{ position: "absolute", left: "10px", top: "11px" }} />
                  </div>
                </label>

                <label style={{ display: "grid", gap: "6px", fontSize: "0.84rem", fontWeight: 600 }}>
                  Choose Master Produce ({masterProducts.length} matches):
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                    required
                    style={{
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.88rem"
                    }}
                  >
                    <option value="">-- Choose Master Product --</option>
                    {masterProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.t_code} · {p.name_vi} / {p.name_en}
                      </option>
                    ))}
                  </select>
                </label>

                {masterProducts.length === 0 && (
                  <div style={{
                    background: "#fffbeb",
                    border: "1px solid #fef08a",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "0.82rem",
                    color: "#92400e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}>
                    <span>No existing master produce matches '{productSearch}'.</span>
                    <button
                      type="button"
                      onClick={() => setMappingMode("create")}
                      style={{
                        background: "#d97706",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        padding: "5px 10px",
                        fontWeight: 700,
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}
                    >
                      + Create Product Now
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "6px" }}>
                  <button
                    type="button"
                    onClick={() => setMappingModalItem(null)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#f1f5f9",
                      cursor: "pointer",
                      fontSize: "0.85rem"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mappingBusy || !selectedProductId}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#087f71",
                      color: "white",
                      fontWeight: 600,
                      cursor: mappingBusy || !selectedProductId ? "not-allowed" : "pointer",
                      opacity: mappingBusy || !selectedProductId ? 0.6 : 1,
                      fontSize: "0.85rem"
                    }}
                  >
                    {mappingBusy ? "Saving…" : "Save & Verify Mapping"}
                  </button>
                </div>
              </form>
            ) : (
              /* TAB 2: CREATE NEW MASTER PRODUCT ON THE FLY */
              <form onSubmit={createAndMapNewProduct} style={{ display: "grid", gap: "12px" }}>
                <div style={{
                  fontSize: "0.82rem",
                  color: "#065f46",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  padding: "10px 12px",
                  borderRadius: "8px"
                }}>
                  <strong>Add New Master Produce:</strong> Register this produce into the master catalogue. It will be standardized and mapped immediately for this order and future shipments.
                </div>

                <StatusMessage error={mappingError} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                  <label style={{ display: "grid", gap: "4px", fontSize: "0.82rem", fontWeight: 600 }}>
                    Produce Code / SKU *
                    <input
                      value={newCode}
                      onChange={e => setNewCode(e.target.value)}
                      placeholder="e.g. 11-009 or 1109"
                      required
                      style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "4px", fontSize: "0.82rem", fontWeight: 600 }}>
                    English Name *
                    <input
                      value={newNameEn}
                      onChange={e => setNewNameEn(e.target.value)}
                      placeholder="e.g. CHINESE CABBAGE (PAK KWAN TUNG)"
                      required
                      style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <label style={{ display: "grid", gap: "4px", fontSize: "0.82rem", fontWeight: 600 }}>
                    Vietnamese Name
                    <input
                      value={newNameVi}
                      onChange={e => setNewNameVi(e.target.value)}
                      placeholder="e.g. Cải ngọt"
                      style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "4px", fontSize: "0.82rem", fontWeight: 600 }}>
                    Thai Name
                    <input
                      value={newNameTh}
                      onChange={e => setNewNameTh(e.target.value)}
                      placeholder="e.g. กวางตุ้ง"
                      style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
                    />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
                  <label style={{ display: "grid", gap: "4px", fontSize: "0.78rem", fontWeight: 600 }}>
                    Category
                    <select
                      value={newProduceType}
                      onChange={e => setNewProduceType(e.target.value)}
                      style={{ padding: "7px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
                    >
                      <option value="LEAFY">Leafy</option>
                      <option value="HERB">Herb</option>
                      <option value="FRUIT">Fruit</option>
                      <option value="ROOT">Root</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "4px", fontSize: "0.78rem", fontWeight: 600 }}>
                    Box Material
                    <select
                      value={newBoxMaterial}
                      onChange={e => setNewBoxMaterial(e.target.value)}
                      style={{ padding: "7px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
                    >
                      <option value="FOAM">Foam</option>
                      <option value="CARDBOARD">Cardboard</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "4px", fontSize: "0.78rem", fontWeight: 600 }}>
                    Temp Zone
                    <select
                      value={newTemperature}
                      onChange={e => setNewTemperature(e.target.value)}
                      style={{ padding: "7px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
                    >
                      <option value="COLD">Cold (Chill)</option>
                      <option value="NORMAL">Normal (Ambient)</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "4px", fontSize: "0.78rem", fontWeight: 600 }}>
                    Pack Size
                    <input
                      value={newPackSize}
                      onChange={e => setNewPackSize(e.target.value)}
                      placeholder="e.g. 100g, 200g"
                      style={{ padding: "7px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setMappingModalItem(null)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      background: "#f1f5f9",
                      cursor: "pointer",
                      fontSize: "0.85rem"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mappingBusy}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#059669",
                      color: "white",
                      fontWeight: 700,
                      cursor: mappingBusy ? "not-allowed" : "pointer",
                      opacity: mappingBusy ? 0.6 : 1,
                      fontSize: "0.85rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    <PlusCircle size={16} /> {mappingBusy ? "Creating…" : "Create & Map Master Product"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
