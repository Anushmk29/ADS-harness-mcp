"use client";

import { useState } from "react";
import { Boxes, LockKeyhole, Play } from "lucide-react";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

export default function PackingPage() {
  const [orderId, setOrderId] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function run(path: string, body?: object) { setMessage(""); setError(""); try { const result = await api<{ status: string; boxes_created?: number }>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); setMessage(`${result.status}${result.boxes_created ? ` · ${result.boxes_created} boxes` : ""}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Packing action failed"); } }
  return <div className="page packing-page"><header className="page-header"><p className="eyebrow">Stage 03 · Packing floor</p><h1>Design and lock packing</h1><p>Generate a constraint-safe plan, start floor work, then freeze verified weights.</p></header><section className="panel packing-console"><label>Client order ID<input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order UUID" /></label><div className="packing-actions"><button onClick={() => run("/packing/solve-design", { order_id: orderId })}><Boxes /><strong>1. Design boxes</strong><span>Apply five hard constraints</span></button><button onClick={() => run(`/packing/orders/${orderId}/start-floor-packing`)}><Play /><strong>2. Start floor work</strong><span>Enable weighing and adjustments</span></button><button className="lock-action" onClick={() => run(`/packing/orders/${orderId}/confirm-final-pack`)}><LockKeyhole /><strong>3. Lock final pack</strong><span>Make packing immutable</span></button></div><StatusMessage error={error} success={message} /></section><aside className="invariant-note"><LockKeyhole size={20} /><div><strong>Locking is permanent.</strong><p>Every box needs matching item totals, net weight and gross weight before final confirmation.</p></div></aside></div>;
}

