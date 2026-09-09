import { ArrowRight, CircleCheck, Clock3, PackageCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";

const stages = [
  { step: "01", title: "Order intake", detail: "Validate matrices and resolve SKUs", href: "/orders", state: "Ready" },
  { step: "02", title: "Procurement", detail: "Confirm market availability", href: "/procurement", state: "Human gate" },
  { step: "03", title: "Packing", detail: "Design, weigh and lock boxes", href: "/packing", state: "Floor work" },
];

export default function OperationsPage() {
  return (
    <div className="page">
      <header className="page-header split-header">
        <div><p className="eyebrow">Wednesday · 9 September 2026</p><h1>Operations control</h1><p>Move today&apos;s shipments through the three verified gates.</p></div>
        <div className="system-badge"><span /> Phase 1–3 foundation</div>
      </header>
      <section className="metric-grid" aria-label="Operational safeguards">
        <article className="metric"><ShieldCheck /><div><strong>2</strong><span>hard invariants active</span></div></article>
        <article className="metric"><Clock3 /><div><strong>&lt;30s</strong><span>intake target</span></div></article>
        <article className="metric"><PackageCheck /><div><strong>5</strong><span>packing constraints</span></div></article>
      </section>
      <section className="panel workflow-panel">
        <div className="section-heading"><div><p className="eyebrow">Today&apos;s route</p><h2>Shipment workflow</h2></div><span className="route-chip">TETE · France</span></div>
        <div className="stage-list">
          {stages.map((stage, index) => (
            <Link className="stage-row" href={stage.href} key={stage.step}>
              <span className="step-number">{stage.step}</span>
              <span className="stage-copy"><strong>{stage.title}</strong><small>{stage.detail}</small></span>
              <span className="stage-state"><CircleCheck size={16} /> {stage.state}</span>
              <ArrowRight size={18} />
              {index < stages.length - 1 && <span className="stage-line" />}
            </Link>
          ))}
        </div>
      </section>
      <aside className="invariant-note"><ShieldCheck size={20} /><div><strong>Final packing is the financial source of truth.</strong><p>Invoices remain blocked until every physical box has a verified net weight and immutable final-pack lock.</p></div></aside>
    </div>
  );
}
