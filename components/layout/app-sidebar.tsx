"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { BarChart3, Building2, FileStack, Home, Inbox, MapPinned, Megaphone, MessageSquare, PlugZap, Settings, Shield, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export const primaryNavigation: Array<{
  id: string;
  href: Route;
  label: string;
  icon: typeof Home;
}> = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: Home },
  { id: "leads", href: "/leads", label: "Leads", icon: Inbox },
  { id: "autoresponder", href: "/autoresponder", label: "Autoresponder", icon: MessageSquare },
  { id: "businesses", href: "/businesses", label: "Businesses", icon: Building2 },
  { id: "programs", href: "/programs", label: "Programs", icon: Megaphone },
  { id: "reporting", href: "/reporting", label: "Reporting", icon: BarChart3 },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings },
  { id: "audit", href: "/audit", label: "Audit", icon: Shield }
];

const foundationNavigation: Array<{
  id: string;
  href: Route;
  label: string;
  icon: typeof Home;
}> = [
  { id: "integrations", href: "/integrations", label: "Integrations", icon: PlugZap },
  { id: "locations", href: "/locations", label: "Locations", icon: MapPinned },
  { id: "services", href: "/services", label: "Services", icon: Wrench }
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-64 border-r border-border/70 bg-slate-950 text-slate-100 xl:w-[16.5rem] lg:block">
      <div className="border-b border-slate-800 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
            <FileStack className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">Yelp Ops Console</div>
            <div className="text-sm text-slate-400">Internal lead and reporting operations</div>
          </div>
        </div>
      </div>
      <div className="space-y-6 p-4">
        <nav className="space-y-1">
        {primaryNavigation.map((item) => {
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

        <div className="space-y-2 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between px-3">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Secondary</div>
            <Badge variant="outline" className="border-slate-700 text-slate-400">
              Limited
            </Badge>
          </div>
          <nav className="space-y-1">
            {foundationNavigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
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
        </div>
      </div>
    </aside>
  );
}
