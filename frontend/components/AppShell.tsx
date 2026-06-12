"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { UserSidebar } from "@/components/UserSidebar";

function getPageLabel(pathname: string) {
  if (pathname.startsWith("/projects/new")) {
    return "New project";
  }

  if (pathname.startsWith("/projects/")) {
    return "Project detail";
  }

  if (pathname.startsWith("/settings/workflow")) {
    return "Workflow settings";
  }

  if (pathname.startsWith("/dashboard")) {
    return "Dashboard";
  }

  return "Workflow Tracker";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginRoute = pathname.startsWith("/login");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedState = window.localStorage.getItem("kf-workflow-sidebar-collapsed");
    if (savedState) {
      setCollapsed(savedState === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("kf-workflow-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const pageLabel = useMemo(() => getPageLabel(pathname), [pathname]);

  if (isLoginRoute) {
    return <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>;
  }

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[auto_minmax(0,1fr)]">
      <UserSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />

      <div className="min-w-0">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Workspace</p>
            <p className="text-sm font-semibold text-ink">{pageLabel}</p>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-full border border-ink/10 bg-sand/60 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink hover:bg-ink hover:text-white"
          >
            Menu
          </button>
        </div>

        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </main>
  );
}
