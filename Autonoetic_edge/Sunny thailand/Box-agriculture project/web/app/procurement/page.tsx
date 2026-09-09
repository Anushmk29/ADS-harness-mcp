"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

export default function ProcurementPage() {
  const [batchId, setBatchId] = useState(""); const [itemsJson, setItemsJson] = useState('[\n  {\n    "item_id": "",\n    "purchased_pack_count": 0,\n    "purchased_weight_kg": 0\n  }\n]'); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function confirm(event: React.FormEvent) { event.preventDefault(); setError(""); setSuccess(""); try { const items = JSON.parse(itemsJson); const result = await api<{ status: string }>(`/procurement/batches/${batchId}/confirm`, { method: "PUT", body: JSON.stringify({ items }) }); setSuccess(`Procurement gate completed: ${result.status}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Confirmation failed"); } }
  return <div className="page"><header className="page-header"><p className="eyebrow">Stage 02 · Human gate</p><h1>Procurement confirmation</h1><p>Record what the market actually supplied, including shortages and replacements.</p></header><form className="panel form-panel narrow" onSubmit={confirm}><div className="section-heading"><div><h2>Confirm purchasing batch</h2><p>This action is attributed to the signed-in buyer.</p></div><ClipboardCheck /></div><label>Batch ID<input value={batchId} onChange={e => setBatchId(e.target.value)} required placeholder="Procurement batch UUID" /></label><label>Confirmed line items<textarea rows={12} value={itemsJson} onChange={e => setItemsJson(e.target.value)} spellCheck={false} /></label><StatusMessage error={error} success={success} /><button className="primary-button">Confirm actual purchases</button></form></div>;
}

