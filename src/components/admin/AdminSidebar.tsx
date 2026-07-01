"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Users,
  Wallet,
  ScrollText,
  Plus,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearToken } from "@/lib/auth";

const NAV = [
  { href: "/admin",             label: "Dashboard",   icon: LayoutDashboard, exact: true },
  { href: "/admin/markets",     label: "Markets",     icon: Store,           exact: false },
  { href: "/admin/users",       label: "Users",       icon: Users,           exact: false },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: Wallet,          exact: false },
  { href: "/admin/audit",       label: "Audit Log",   icon: ScrollText,      exact: false },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push("/");
  }

  return (
    <aside className="flex flex-col h-full py-6 px-4 bg-brand-surface border-r border-brand-border w-64 shrink-0">
      <div className="mb-10">
        <div className="text-lg font-bold text-brand-yes tracking-tight">NoCut.ng</div>
        <div className="text-[10px] text-brand-subtle uppercase tracking-widest mt-0.5">Admin Console</div>
      </div>

      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "text-brand-yes font-semibold bg-brand-yes/10 border-r-2 border-brand-yes"
                  : "text-brand-muted hover:text-brand-text hover:bg-white/5"
              )}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 pt-4 border-t border-brand-border">
        <Link
          href="/admin/markets/new"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-brand-yes text-white text-sm font-semibold hover:brightness-110 transition-all"
        >
          <Plus size={15} />
          New Market
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-brand-muted hover:text-brand-no hover:bg-brand-no/10 transition-colors"
        >
          <LogOut size={15} />
          Log out
        </button>
      </div>
    </aside>
  );
}
