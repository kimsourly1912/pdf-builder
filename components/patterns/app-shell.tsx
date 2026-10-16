"use client";

import {
  Archive,
  Home,
  Files,
  FileText,
  UsersRound,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/patterns/theme-toggle";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type AppShellProps = {
  children: ReactNode;
  displayName: string;
  fullWidth?: boolean;
};

const navigationItems = [
  { href: "/", label: "Home", icon: Home, children: [] },
  {
    href: "/hiring",
    label: "Hiring",
    icon: UsersRound,
    children: [
      { href: "/hiring", label: "Hiring pipeline" },
      { href: "/intake", label: "Incoming candidates" },
      { href: "/resumes", label: "CV library" },
    ],
  },
  {
    href: "/forms",
    label: "Forms & documents",
    icon: Files,
    children: [
      { href: "/forms", label: "Form templates" },
      { href: "/submissions", label: "Submitted forms" },
    ],
  },
  { href: "/workflows", label: "Automation", icon: Workflow, children: [] },
  {
    href: "/advanced",
    label: "Advanced tools",
    icon: FileText,
    children: [
      { href: "/templates", label: "PDF templates" },
      { href: "/studio", label: "PDF studio" },
    ],
  },
  {
    href: "/administration",
    label: "Administration",
    icon: Archive,
    children: [
      { href: "/administration", label: "Settings & integrations" },
      { href: "/hiring/pipelines", label: "Hiring models & jobs" },
      { href: "/hiring/legacy", label: "Legacy hiring records" },
      { href: "/setup", label: "Workspace setup" },
      { href: "/accounts", label: "Account access" },
      { href: "/analyses", label: "AI history" },
      { href: "/activity", label: "Activity" },
      { href: "/archive", label: "Archive" },
      { href: "/test-data", label: "Test data reset" },
    ],
  },
];
function matches(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  const matched = navigationItems
    .flatMap((item) => [
      { item, href: item.href, label: item.label },
      ...item.children.map((child) => ({
        item,
        href: child.href,
        label: child.label,
      })),
    ])
    .filter((entry) => matches(pathname, entry.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const currentItem =
    matched?.item ?? navigationItems.find((item) => item.href === "/hiring")!;
  const currentLabel = matched?.label ?? currentItem.label;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="border-b border-sidebar-border/70">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="HR Workspace">
                <Link href="/">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <FileText className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">HR Workspace</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      Candidates & documents
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
                  const active = item === currentItem;
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
                      {item.children.length > 0 && active && (
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={matches(pathname, child.href)}
                              >
                                <Link href={child.href}>
                                  <span>{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
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
            <p className="truncate text-sm font-medium">{currentLabel}</p>
          </div>
          <ThemeToggle />
          <SignOutButton />
        </header>
        <div className="flex flex-1 flex-col">
          <div
            className={`mx-auto flex w-full min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8 ${props.fullWidth ? "max-w-none" : "max-w-7xl"}`}
          >
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
