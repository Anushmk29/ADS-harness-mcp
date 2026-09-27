"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  PackageOpen,
  ReceiptText,
  Search,
  Sprout,
  Truck
} from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { StatusMessage } from "@/components/status-message";

type SessionUser = { full_name: string; role: string };

type OperationsBadgeSummary = {
  active_orders?: number;
  awaiting_procurement?: number;
  boxes_missing_weights?: number;
  awaiting_billing?: number;
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [badges, setBadges] = useState<OperationsBadgeSummary | null>(null);
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month">("today");

  useEffect(() => {
    if (pathname === "/login") return;
    api<SessionUser>("/auth/me")
      .then(user => {
        setSession(user);
        setSessionError("");
        // Load summary for live badges
        api<OperationsBadgeSummary>("/operations/summary")
          .then(setBadges)
          .catch(() => {
            // Non-blocking badge error
          });
      })
      .catch(reason => {
        setSession(null);
        setSessionError(reason instanceof Error ? reason.message : "Unable to verify your session");
      });
  }, [pathname]);

  if (pathname === "/login") return children;

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const userInitials = session?.full_name
    ? session.full_name
        .split(" ")
        .map(part => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "FF";

  const todayFormatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  const navItems = [
    {
      href: "/",
      label: "Operations",
      icon: LayoutDashboard,
      badge: "Live",
      badgeType: "live"
    },
    {
      href: "/orders",
      label: "Order intake",
      icon: PackageOpen,
      badge: badges?.active_orders !== undefined ? `${badges.active_orders}` : "111",
      badgeType: "cyan"
    },
    {
      href: "/procurement",
      label: "Procurement",
      icon: ClipboardCheck,
      badge: badges?.awaiting_procurement !== undefined ? `${badges.awaiting_procurement}` : "12",
      badgeType: "amber"
    },
    {
      href: "/packing",
      label: "Packing floor",
      icon: Boxes,
      badge: badges?.boxes_missing_weights !== undefined ? `${badges.boxes_missing_weights} scale` : "3 scale",
      badgeType: "rose"
    },
    {
      href: "/billing",
      label: "Billing",
      icon: ReceiptText,
      badge: badges?.awaiting_billing !== undefined ? `${badges.awaiting_billing} pend` : "0 pend",
      badgeType: "emerald"
    }
  ];

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Primary sidebar">
        <div>
          <Link className="brand" href="/" style={{ textDecoration: "none" }}>
            <span className="brand-mark" style={{ background: "#ffffff", padding: "2px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/logo.png" alt="Agriculture is life" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </span>
            <span>
              Agriculture is life
              <small>Operations system</small>
            </span>
          </Link>

          <div className="sidebar-search">
            <Search size={15} />
            <input
              type="text"
              placeholder="Quick find modules..."
              aria-label="Quick find modules"
              readOnly
              onClick={() => router.push("/orders")}
            />
            <kbd>⌘K</kbd>
          </div>

          <div className="nav-section-title">Primary Workflows</div>
          <nav aria-label="Primary navigation">
            {navItems.map(({ href, label, icon: Icon, badge, badgeType }) => {
              const isActive = pathname === href;
              return (
                <Link
                  className={isActive ? "nav-link active" : "nav-link"}
                  href={href}
                  key={href}
                >
                  <div className="nav-link-left">
                    <Icon size={18} />
                    <span>{label}</span>
                  </div>
                  {badge && (
                    <span className={`nav-badge ${badgeType}`}>{badge}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {session && (
          <div className="user-card-sidebar">
            <div className="user-avatar-badge">
              {userInitials}
              <span className="user-online-dot" />
            </div>
            <div className="user-info-text">
              <strong>{session.full_name}</strong>
              <small>{session.role.replaceAll("_", " ")}</small>
            </div>
            <button
              className="signout-icon-btn"
              type="button"
              onClick={signOut}
              title="Sign out of Agriculture is life"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div className="top-header-meta">
            <span className="top-header-date">{todayFormatted}</span>
            <div className="top-header-shift">
              <span>Shift A (06:00 – 14:30)</span>
              <span>•</span>
              <span>Bangkok Packing Terminal 01 (EU Export)</span>
            </div>
          </div>

          <div className="top-header-controls">
            <div className="header-status-pill">
              <span className="status-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
              Production readiness controls active
            </div>

            <div className="header-date-filter" role="tablist">
              <button
                type="button"
                className={dateFilter === "today" ? "active" : ""}
                onClick={() => setDateFilter("today")}
              >
                Today
              </button>
              <button
                type="button"
                className={dateFilter === "week" ? "active" : ""}
                onClick={() => setDateFilter("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={dateFilter === "month" ? "active" : ""}
                onClick={() => setDateFilter("month")}
              >
                Month
              </button>
            </div>

            <button
              className="icon-action-btn"
              type="button"
              title="Notifications"
              aria-label="Notifications"
              onClick={() => router.push("/orders")}
            >
              <Bell size={16} />
              <span className="notification-dot" />
            </button>

            <Link href="/packing" className="top-dispatch-btn">
              <Truck size={15} />
              <span>Dispatch Run</span>
            </Link>
          </div>
        </header>

        <StatusMessage error={sessionError} />
        {children}
      </div>
    </div>
  );
}
