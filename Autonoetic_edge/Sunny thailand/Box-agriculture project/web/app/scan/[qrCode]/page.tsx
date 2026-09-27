"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, PackageSearch } from "lucide-react";
import { api } from "@/lib/api";
import { StatusMessage } from "@/components/status-message";

type ScanResult = {
  qr_code_uid: string;
  box_number: number;
  order_ref_id: string;
  customer_code: string;
  route_code: string;
  shipment_date: string;
  is_locked: boolean;
  actual_net_weight_kg: number | null;
  actual_gross_weight_kg: number | null;
  items: Array<{
    product_code: string;
    produce_name: string;
    pack_size: string;
    packed_count: number;
    net_weight_kg: number;
  }>;
};

export default function ScanBoxPage() {
  const params = useParams<{ qrCode: string }>();
  const [box, setBox] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.qrCode) return;
    api<ScanResult>(`/packing/scan/${encodeURIComponent(params.qrCode)}`)
      .then(setBox)
      .catch(reason => setError(reason instanceof Error ? reason.message : "Unable to read this box code"));
  }, [params.qrCode]);

  return (
    <div className="page" style={{ maxWidth: "900px" }}>
      <header className="page-header">
        <p className="eyebrow">Verified box scan</p>
        <h1>Box traceability</h1>
      </header>
      <StatusMessage error={error} />
      {!box && !error && <div className="panel"><PackageSearch /> Loading box record…</div>}
      {box && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>{box.customer_code} · Box #{box.box_number}</h2>
              <p>{box.order_ref_id} · {box.route_code} · {box.shipment_date}</p>
            </div>
            {box.is_locked && <span style={{ color: "#166534", display: "flex", gap: "6px" }}><CheckCircle2 /> Final pack locked</span>}
          </div>
          <p>Net: <strong>{box.actual_net_weight_kg ?? "Not weighed"} kg</strong> · Gross: <strong>{box.actual_gross_weight_kg ?? "Not weighed"} kg</strong></p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">SKU</th><th align="left">Product</th><th align="left">Pack</th><th align="right">Count</th><th align="right">Net kg</th></tr></thead>
            <tbody>{box.items.map((item, index) => (
              <tr key={`${item.product_code}-${item.pack_size}-${index}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td>{item.product_code}</td><td>{item.produce_name}</td><td>{item.pack_size}</td><td align="right">{item.packed_count}</td><td align="right">{item.net_weight_kg.toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table>
          <Link href="/packing" className="primary-button" style={{ display: "inline-flex", marginTop: "18px", textDecoration: "none" }}>Back to packing</Link>
        </section>
      )}
    </div>
  );
}
