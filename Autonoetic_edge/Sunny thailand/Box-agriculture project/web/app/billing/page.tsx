"use client";

import { useEffect, useState } from "react";
import { Banknote, CircleCheckBig, FileText, Landmark, LockKeyhole } from "lucide-react";
import { api, apiBlob } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

type Invoice = {
  invoice_id: string;
  invoice_number: string;
  total_amount_eur: number;
  amount_paid_eur: number;
  status: string;
};

type PaymentResult = {
  status: string;
  rolling_balance_remaining_eur: number;
  receipt_issued: boolean;
  receipt_number: string | null;
};

type BillingQueueItem = {
  order_id: string;
  order_ref_id: string;
  customer_code: string;
  customer_name: string;
  order_status: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
};

export default function BillingPage() {
  const [orderId, setOrderId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [paymentMode, setPaymentMode] = useState("BANK_TRANSFER");
  const [invoice, setInvoice] = useState<Invoice>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [receiptReady, setReceiptReady] = useState(false);
  const [workQueue, setWorkQueue] = useState<BillingQueueItem[]>([]);

  useEffect(() => {
    api<BillingQueueItem[]>("/invoicing/work-queue")
      .then(items => {
        setWorkQueue(items || []);
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const paramOrderId = params.get("orderId");
          if (paramOrderId) {
            setOrderId(paramOrderId);
            const selected = (items || []).find(item => item.order_id === paramOrderId);
            if (selected) {
              setInvoiceId(selected.invoice_id ?? "");
              setReceiptReady(selected.order_status === "RECEIPTS_ISSUED" || selected.order_status === "ORDER_CLOSED");
            }
          }
        }
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Billing queue could not be loaded"));
  }, []);

  function selectOrder(selectedOrderId: string) {
    setOrderId(selectedOrderId);
    const selected = workQueue.find(item => item.order_id === selectedOrderId);
    setInvoiceId(selected?.invoice_id ?? "");
    setReceiptReady(selected?.order_status === "RECEIPTS_ISSUED" || selected?.order_status === "ORDER_CLOSED");
  }

  async function run(action: () => Promise<void>) {
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Financial action failed");
    }
  }

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<Invoice>("/invoicing/generate-on-behalf", {
        method: "POST",
        body: JSON.stringify({ client_order_id: orderId }),
      });
      setInvoice(result);
      setInvoiceId(result.invoice_id);
      setMessage(`Draft ${result.invoice_number} created from locked final packing.`);
    });
  }

  async function approve(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<Invoice>(`/invoicing/${invoiceId}/approve-dispatch`, {
        method: "POST",
      });
      setInvoice(result);
      setMessage(`${result.invoice_number} approved and marked as sent.`);
    });
  }

  async function recordPayment(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const response = await api<{ payment_details: PaymentResult }>(
        `/invoicing/${invoiceId}/record-payment`,
        {
          method: "POST",
          body: JSON.stringify({
            amount_paid: Number(amount),
            payment_date: paymentDate,
            bank_name: "Bank transfer",
            bank_wire_reference: bankReference,
            payment_mode: paymentMode,
          }),
        },
      );
      const result = response.payment_details;
      setReceiptReady(result.receipt_issued);
      setMessage(
        result.receipt_issued
          ? `Paid in full. Receipt ${result.receipt_number} issued.`
          : `Payment recorded. THB ฿${result.rolling_balance_remaining_eur.toFixed(2)} remains.`,
      );
    });
  }

  async function openDocument(path: string) {
    await run(async () => {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  async function closeOrder() {
    await run(async () => {
      const result = await api<{ status: string }>(`/invoicing/${invoiceId}/close-order`, { method: "POST" });
      setMessage(`Financial reconciliation complete. Order status is ${result.status}.`);
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Phase 04 · Order-to-cash</p>
        <h1>Accounting settlement</h1>
        <p>Create billing only from locked packing, approve it, then record cleared funds.</p>
      </header>
      <StatusMessage error={error} success={message} />
      <section className="panel form-panel" style={{ marginBottom: "20px" }}>
        <label>
          Billing work queue
          <select value={orderId} onChange={event => selectOrder(event.target.value)}>
            <option value="">Select a customer order</option>
            {workQueue.map(item => (
              <option key={item.order_id} value={item.order_id}>
                {item.order_ref_id} · {item.customer_code} · {item.order_status}{item.invoice_number ? ` · ${item.invoice_number}` : ""}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="billing-grid">
        <form className="panel form-panel" onSubmit={createDraft}>
          <div className="section-heading"><div><h2>1. Create draft</h2><p>AI Agent 1 only</p></div><Banknote /></div>
          <label>Client order ID<input value={orderId} readOnly required /></label>
          <button className="primary-button">Generate from final pack</button>
        </form>
        <form className="panel form-panel" onSubmit={approve}>
          <div className="section-heading"><div><h2>2. Review and dispatch</h2><p>Accounting approval gate</p></div><CircleCheckBig /></div>
          <label>Invoice ID<input value={invoiceId} readOnly required /></label>
          <button className="primary-button">Approve and dispatch</button>
        </form>
        <form className="panel form-panel" onSubmit={recordPayment}>
          <div className="section-heading"><div><h2>3. Confirm payment</h2><p>A receipt is issued only at zero balance</p></div><Landmark /></div>
          <label>Cleared amount (THB ฿)<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
          <div className="field-row">
            <label>Payment date<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label>
            <label>Bank reference<input value={bankReference} onChange={(event) => setBankReference(event.target.value)} required /></label>
          </div>
          <label>Payment mode<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}><option value="BANK_TRANSFER">Bank transfer</option><option value="CREDIT_LETTER">Credit letter</option><option value="CASH">Cash</option></select></label>
          <button className="primary-button">Record cleared funds</button>
        </form>
      </section>
      {invoice && <aside className="invariant-note"><CircleCheckBig size={20} /><div><strong>{invoice.invoice_number} · {invoice.status}</strong><p>Total THB ฿{invoice.total_amount_eur.toFixed(2)} · Paid THB ฿{invoice.amount_paid_eur.toFixed(2)}</p></div></aside>}
      {invoiceId && (
        <section className="panel" style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="primary-button" type="button" onClick={() => openDocument(`/invoicing/${invoiceId}/html`)}><FileText size={17} /> Open printable invoice</button>
          <button className="primary-button" type="button" disabled={!receiptReady} onClick={() => openDocument(`/invoicing/${invoiceId}/receipt?format=html`)}><FileText size={17} /> Open official receipt</button>
          <button className="primary-button" type="button" disabled={!receiptReady} onClick={closeOrder}><LockKeyhole size={17} /> Reconcile and close order</button>
        </section>
      )}
    </div>
  );
}
