"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { BarChart3, FileStack, Home, Inbox, MapPinned, Megaphone, PlugZap, Settings, Shield, Wrench } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const navigation: Array<{
  id: string;
  href: Route;
  label: string;
  icon: typeof Home;
}> = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: Home },
  { id: "ads", href: "/ads", label: "Ads", icon: Megaphone },
  { id: "leads", href: "/leads", label: "Leads", icon: Inbox },
  { id: "reporting", href: "/reporting", label: "Reporting", icon: BarChart3 },
  { id: "locations", href: "/locations", label: "Locations", icon: MapPinned },
  { id: "services", href: "/services", label: "Services", icon: Wrench },
  { id: "integrations", href: "/integrations", label: "Integrations", icon: PlugZap },
  { id: "settings", href: "/settings", label: "Admin Settings", icon: Settings },
  { id: "audit", href: "/audit", label: "Audit / Sync Logs", icon: Shield }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-72 border-r border-border/70 bg-slate-950 text-slate-100 lg:block">
      <div className="border-b border-slate-800 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
            <FileStack className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">Yelp Operations Console</div>
            <div className="text-sm text-slate-400">Ads, leads, reporting, CRM</div>
          </div>
        </div>
      </div>
      <nav className="space-y-1 p-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors",
                active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
