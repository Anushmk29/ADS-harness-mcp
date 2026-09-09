"use client";

import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

type Ack = { raw_file_id: string; total_sub_customers_detected: number; sub_customer_codes: string[]; verification_notice: string };

export default function OrdersPage() {
  const [file, setFile] = useState<File>(); const [shipmentDate, setShipmentDate] = useState(""); const [route, setRoute] = useState("TETE"); const [result, setResult] = useState<Ack>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function upload(event: React.FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); setError(""); const body = new FormData(); body.set("file", file); body.set("shipment_date", shipmentDate); body.set("route_line", route); try { setResult(await api<Ack>("/orders/upload-matrix", { method: "POST", body })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed"); } finally { setBusy(false); } }
  return <div className="page"><header className="page-header"><p className="eyebrow">Stage 01</p><h1>Order intake</h1><p>Inspect a customer matrix before creating any client orders.</p></header><div className="two-column"><form className="panel form-panel" onSubmit={upload}><div className="section-heading"><div><h2>New order matrix</h2><p>Excel workbooks only · original file retained</p></div><FileSpreadsheet /></div><label className="file-drop"><Upload /><strong>{file?.name ?? "Choose an order workbook"}</strong><span>Drop or select .xlsx</span><input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0])} required /></label><div className="field-row"><label>Shipment date<input type="date" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)} required /></label><label>Route<select value={route} onChange={e => setRoute(e.target.value)}><option>TETE</option><option>NGA</option><option>FR</option><option>DE</option><option>UK</option></select></label></div><StatusMessage error={error} /><button className="primary-button" disabled={busy}>{busy ? "Inspecting workbook…" : "Upload and inspect"}</button></form><section className="panel result-panel"><p className="eyebrow">Human verification</p><h2>{result ? `${result.total_sub_customers_detected} customers detected` : "Awaiting a workbook"}</h2>{result ? <><p>{result.verification_notice}</p><div className="code-cloud">{result.sub_customer_codes.map(code => <span key={code}>{code}</span>)}</div><p className="record-id">Record {result.raw_file_id}</p></> : <p>Customer columns, sheets and product rows will appear here before the split is authorized.</p>}</section></div></div>;
}

