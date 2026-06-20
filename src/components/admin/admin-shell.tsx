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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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

const NAV_ITEMS = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/products", label: "Products", icon: Package },
  {
    to: "/admin/inventory",
    label: "Inventory & expenses",
    icon: Boxes,
    alertKey: "stock" as const,
  },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/promos", label: "Promo codes", icon: Tag },
  { to: "/admin/sales-report", label: "Sales report", icon: FileBarChart },
  { to: "/admin/ad-spending", label: "Ad spending", icon: Megaphone },
  { to: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { to: "/admin/content", label: "Content", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AdminShell({ children, email }: { children: ReactNode; email?: string | null }) {
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.to));
  const [lowStockCount, setLowStockCount] = useState(0);

  const refreshAlertCount = () => {
    supabase
      .from("stock_alerts")
      .select("id", { count: "exact", head: true })
      .eq("acknowledged", false)
      .then(({ count }) => setLowStockCount(count ?? 0));
  };

  useEffect(() => {
    refreshAlertCount();
    // Re-check whenever the admin returns to the tab, so an alert
    // acknowledged in another tab (or stock that changed since) reflects
    // here without needing a manual refresh.
    window.addEventListener("focus", refreshAlertCount);
    return () => window.removeEventListener("focus", refreshAlertCount);
  }, []);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link to="/" className="flex items-center gap-2 px-2 py-1.5 text-sidebar-foreground">
            <div className="size-7 rounded-md bg-sidebar-accent grid place-items-center shrink-0">
              <ShieldCheck className="size-4 text-sidebar-primary" />
            </div>
            <span className="font-display text-base tracking-tight group-data-[collapsible=icon]:hidden">
              Admin panel
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((item) => (
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
            <div className="px-2 py-1.5 text-xs text-sidebar-foreground/60 truncate group-data-[collapsible=icon]:hidden">
              {email}
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur sticky top-0 z-30 px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <div className="text-sm text-muted-foreground">
            Admin{current && <span className="text-foreground"> / {current.label}</span>}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 bg-muted/30 min-h-[calc(100svh-3.5rem)]">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
