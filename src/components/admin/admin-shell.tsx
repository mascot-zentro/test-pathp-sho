import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  HelpCircle,
  FileText,
  Settings as SettingsIcon,
  Store,
  ShieldCheck,
  FileBarChart,
  Megaphone,
  Tag,
  Users,
  LineChart,
  ScrollText,
  ChevronRight,
  AlertTriangle,
  X,
  Heart,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/inventory", label: "Inventory & expenses", icon: Boxes, alertKey: "stock" as const },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { to: "/admin/customers", label: "Customers", icon: Users },
      { to: "/admin/promos", label: "Promo codes", icon: Tag },
      { to: "/admin/sales-report", label: "Sales report", icon: FileBarChart },
      { to: "/admin/profit-loss", label: "Profit & Loss", icon: LineChart },
      { to: "/admin/ad-spending", label: "Ad spending", icon: Megaphone },
      { to: "/admin/audit", label: "Fiscal Audit", icon: ScrollText },
    ],
  },
  {
    label: "Store",
    items: [
      { to: "/admin/faqs", label: "FAQs", icon: HelpCircle },
      { to: "/admin/content", label: "Content", icon: FileText },
      { to: "/admin/impact", label: "Impact", icon: Heart },
      { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
] as const;

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function AdminShell({ children, email }: { children: ReactNode; email?: string | null }) {
  const { pathname } = useLocation();
  const current = ALL_NAV_ITEMS.find((item) => pathname.startsWith(item.to));
  const [lowStockCount, setLowStockCount] = useState(0);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const refreshAlertCount = () => {
    supabase
      .from("stock_alerts")
      .select("id", { count: "exact", head: true })
      .eq("acknowledged", false)
      .then(({ count }) => setLowStockCount(count ?? 0));
  };

  useEffect(() => {
    refreshAlertCount();
    window.addEventListener("focus", refreshAlertCount);
    return () => window.removeEventListener("focus", refreshAlertCount);
  }, []);

  const emailInitial = email ? email[0].toUpperCase() : "A";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2.5 px-2 py-2 text-sidebar-foreground group">
            <div className="size-7 rounded-md bg-sidebar-primary grid place-items-center shrink-0">
              <ShieldCheck className="size-4 text-sidebar-primary-foreground" />
            </div>
            <div className="group-data-[collapsible=icon]:hidden min-w-0">
              <div className="font-display text-sm tracking-tight leading-none text-sidebar-foreground">
                Admin
              </div>
              <div className="text-[10px] text-sidebar-foreground/50 mt-0.5 leading-none">
                Management panel
              </div>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="text-[10px] tracking-widest uppercase text-sidebar-foreground/40">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(item.to)}
                        tooltip={item.label}
                      >
                        <Link to={item.to}>
                          <item.icon />
                          <span className="flex-1">{item.label}</span>
                          {"alertKey" in item && lowStockCount > 0 && (
                            <Badge
                              variant="destructive"
                              className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px] group-data-[collapsible=icon]:hidden"
                            >
                              {lowStockCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="View store">
                <Link to="/">
                  <Store />
                  <span>View store</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {email && (
            <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
              <div className="size-6 rounded-full bg-sidebar-primary grid place-items-center shrink-0">
                <span className="text-[10px] font-medium text-sidebar-primary-foreground">{emailInitial}</span>
              </div>
              <span className="text-xs text-sidebar-foreground/60 truncate flex-1">{email}</span>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur sticky top-0 z-30 px-4">
          <SidebarTrigger className="shrink-0" />
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-muted-foreground shrink-0">Admin</span>
            {current && (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
                <span className="font-medium truncate">{current.label}</span>
              </>
            )}
          </div>
        </header>
        {lowStockCount > 0 && !alertDismissed && (
          <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-amber-800 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-amber-500" />
            <span className="flex-1">
              <strong>{lowStockCount} {lowStockCount === 1 ? "product" : "products"}</strong> running low on stock (≤ 5 units).{" "}
              <Link to="/admin/inventory" className="underline underline-offset-2 font-medium hover:text-amber-900">
                View inventory →
              </Link>
            </span>
            <button
              onClick={() => setAlertDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 hover:bg-amber-100 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <main className="flex-1 p-4 md:p-8 bg-muted/20 min-h-[calc(100svh-3.5rem)]">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
