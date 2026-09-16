"use client";

import {
  Activity,
  FilePenLine,
  Files,
  FileText,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Separator } from "@/components/ui/separator";
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
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type AppShellProps = {
  children: ReactNode;
  displayName: string;
};

const navigationItems = [
  { href: "/", label: "Editor", icon: FilePenLine, exact: true },
  { href: "/templates", label: "Templates", icon: Files },
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/accounts", label: "Accounts", icon: UsersRound },
  { href: "/activity", label: "Activity", icon: Activity },
];

function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  const currentItem =
    navigationItems.find((item) =>
      item.exact ? pathname === item.href : pathname.startsWith(item.href),
    ) ?? navigationItems[0];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="border-b border-sidebar-border/70">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="PDF Studio">
                <Link href="/templates">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <FileText className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">PDF Studio</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      HR workspace
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/70">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip={props.displayName}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold">
                  {getInitials(props.displayName)}
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">
                    {props.displayName}
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Workspace owner
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden border border-border/70 shadow-xs md:min-h-[calc(100svh-1rem)]">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-card/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/75">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{currentItem.label}</p>
          </div>
          <SignOutButton />
        </header>
        <div className="flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
            {props.children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function getInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "PO";
}

export { AppShell };
export type { AppShellProps };
