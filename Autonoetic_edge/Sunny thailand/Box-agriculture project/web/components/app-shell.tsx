"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ClipboardCheck, LayoutDashboard, LogOut, PackageOpen, Sprout } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { href: "/", label: "Operations", icon: LayoutDashboard },
  { href: "/orders", label: "Order intake", icon: PackageOpen },
  { href: "/procurement", label: "Procurement", icon: ClipboardCheck },
  { href: "/packing", label: "Packing floor", icon: Boxes },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><Sprout size={22} /></span>
          <span>FreshFlow<small>Operations system</small></span>
        </Link>
        <nav aria-label="Primary navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link className={pathname === href ? "nav-link active" : "nav-link"} href={href} key={href}>
              <Icon size={19} /> {label}
            </Link>
          ))}
        </nav>
        <Link className="nav-link signout" href="/login" onClick={() => localStorage.removeItem("access_token")}>
          <LogOut size={18} /> Sign out
        </Link>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

