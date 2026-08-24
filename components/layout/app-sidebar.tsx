"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { RoleCode } from "@prisma/client";
import {
  BarChart3,
  Building2,
  FileStack,
  Home,
  Inbox,
  MapPinned,
  Menu,
  ListChecks,
  Megaphone,
  MessageSquare,
  PlugZap,
  Settings,
  Shield,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { hasPermission, type Permission } from "@/lib/permissions";

export type NavigationItem = {
  id: string;
  href: Route;
  label: string;
  icon: typeof Home;
  anyPermission: Permission[];
};

export const primaryNavigation: NavigationItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: Home,
    anyPermission: ["businesses:read"],
  },
  {
    id: "leads",
    href: "/leads",
    label: "Leads",
    icon: Inbox,
    anyPermission: ["leads:read"],
  },
  {
    id: "autoresponder",
    href: "/autoresponder",
    label: "Autoresponder",
    icon: MessageSquare,
    anyPermission: ["autoresponder:manage", "replies:review"],
  },
  {
    id: "businesses",
    href: "/businesses",
    label: "Businesses",
    icon: Building2,
    anyPermission: ["businesses:read"],
  },
  {
    id: "programs",
    href: "/programs",
    label: "Programs",
    icon: Megaphone,
    anyPermission: ["programs:read"],
  },
  {
    id: "reporting",
    href: "/reporting",
    label: "Reporting",
    icon: BarChart3,
    anyPermission: ["reports:read"],
  },
  {
    id: "onboarding",
    href: "/onboarding",
    label: "Onboarding",
    icon: ListChecks,
    anyPermission: ["onboarding:read"],
  },
  {
    id: "settings",
    href: "/settings",
    label: "Settings",
    icon: Settings,
    anyPermission: [
      "credentials:manage",
      "users:manage",
      "autoresponder:manage",
    ],
  },
  {
    id: "audit",
    href: "/audit",
    label: "Audit",
    icon: Shield,
    anyPermission: ["audit:read"],
  },
];

export const foundationNavigation: NavigationItem[] = [
  {
    id: "integrations",
    href: "/integrations",
    label: "Integrations",
    icon: PlugZap,
    anyPermission: ["integrations:read"],
  },
  {
    id: "locations",
    href: "/locations",
    label: "Locations",
    icon: MapPinned,
    anyPermission: ["locations:read"],
  },
  {
    id: "services",
    href: "/services",
    label: "Services",
    icon: Wrench,
    anyPermission: ["services:read"],
  },
];

export function getNavigationForRole(roleCode: RoleCode) {
  const isAllowed = (item: NavigationItem) =>
    item.anyPermission.some((permission) =>
      hasPermission(roleCode, permission),
    );

  return {
    primary: primaryNavigation.filter(isAllowed),
    foundation: foundationNavigation.filter(isAllowed),
  };
}

function NavigationLinks({
  items,
  pathname,
  closeOnSelect = false,
}: {
  items: NavigationItem[];
  pathname: string;
  closeOnSelect?: boolean;
}) {
  return items.map((item) => {
    const Icon = item.icon;
    const active =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    const link = (
      <Link
        href={item.href}
        className={cn(
          "flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.label}</span>
        </span>
      </Link>
    );

    return closeOnSelect ? (
      <DialogClose asChild key={item.id}>
        {link}
      </DialogClose>
    ) : (
      <div key={item.id}>{link}</div>
    );
  });
}

function NavigationContent({
  roleCode,
  mobile = false,
}: {
  roleCode: RoleCode;
  mobile?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const navigation = getNavigationForRole(roleCode);

  return (
    <>
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileStack className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">Yelp Ops Console</div>
            <div className="text-xs text-muted-foreground">
              Lead and reporting operations
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-6 p-4">
        <nav className="space-y-1">
          <NavigationLinks
            items={navigation.primary}
            pathname={pathname}
            closeOnSelect={mobile}
          />
        </nav>

        {navigation.foundation.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="px-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Setup
            </div>
            <nav className="space-y-1">
              <NavigationLinks
                items={navigation.foundation}
                pathname={pathname}
                closeOnSelect={mobile}
              />
            </nav>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function AppSidebar({
  roleCode,
  mobile = false,
}: {
  roleCode: RoleCode;
  mobile?: boolean;
}) {
  if (mobile) {
    return (
      <Dialog>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              Yelp Ops Console
            </div>
            <div className="text-xs text-muted-foreground">Workspace menu</div>
          </div>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent className="left-0 top-0 h-dvh max-w-[20rem] translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0 sm:max-w-[22rem]">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Open a workspace section available to your role.
          </DialogDescription>
          <NavigationContent roleCode={roleCode} mobile />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <aside className="hidden min-h-screen w-64 border-r border-border/70 bg-card text-foreground lg:block xl:w-[16.5rem]">
      <NavigationContent roleCode={roleCode} />
    </aside>
  );
}
