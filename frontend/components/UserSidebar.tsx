"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Department, ViewerDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

type ViewerWithMetadata = ViewerDetails & {
  metadata: Record<string, unknown>;
};

type IconProps = {
  className?: string;
};

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapsed: () => void;
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: (props: IconProps) => JSX.Element;
};

function DashboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function NewProjectIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h3l1.5 2H17A2.5 2.5 0 0 1 19.5 8.5v8A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </svg>
  );
}

function WorkflowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M4 17h16" />
      <path d="M11 12h9" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="8" cy="12" r="2.5" />
      <circle cx="13" cy="17" r="2.5" />
    </svg>
  );
}

function ReportsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4.5 19.5h15" />
      <path d="M7.5 16V10.5" />
      <path d="M12 16V6.5" />
      <path d="M16.5 16V12.5" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M10 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19H10" />
      <path d="M14 8l5 4-5 4" />
      <path d="M19 12H9" />
    </svg>
  );
}

function getInitials(fullName: string) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  return initials || "KF";
}

function buildViewer(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): ViewerWithMetadata {
  const metadata = user.user_metadata ?? {};
  const department =
    typeof metadata.department === "string" ? (metadata.department as Department) : null;
  const rawFullName =
    typeof metadata.full_name === "string" && metadata.full_name.trim()
      ? metadata.full_name.trim()
      : typeof metadata.fullName === "string" && metadata.fullName.trim()
        ? metadata.fullName.trim()
        : typeof metadata.name === "string" && metadata.name.trim()
          ? metadata.name.trim()
          : null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: rawFullName ?? user.email?.split("@")[0] ?? "Workflow user",
    department,
    metadata
  };
}

export function UserSidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [viewer, setViewer] = useState<ViewerWithMetadata | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: ""
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [savePending, startSaveTransition] = useTransition();
  const [logoutPending, startLogoutTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();

    const syncViewer = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (!user) {
        setViewer(null);
        return;
      }

      const nextViewer = buildViewer(user);
      setViewer(nextViewer);
      setForm({
        fullName: nextViewer.fullName,
        email: nextViewer.email
      });
    };

    void syncViewer();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      if (!session?.user) {
        setViewer(null);
        return;
      }

      const nextViewer = buildViewer(session.user);
      setViewer(nextViewer);
      setForm({
        fullName: nextViewer.fullName,
        email: nextViewer.email
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      {
        href: "/dashboard",
        label: "Dashboard",
        description: "Overview and project monitor",
        icon: DashboardIcon
      },
      {
        href: "/projects/new",
        label: "New Project",
        description: "Create and seed a workflow",
        icon: NewProjectIcon
      }
    ];

    if (viewer?.department === "Sales" || viewer?.department === "Admin") {
      items.push({
        href: "/reports",
        label: "Reports",
        description: "Monthly audit and trend view",
        icon: ReportsIcon
      });
    }

    if (viewer?.department === "Admin") {
      items.push({
        href: "/settings/workflow",
        label: "Workflow Settings",
        description: "Manage stage owners and SLAs",
        icon: WorkflowIcon
      });
    }

    return items;
  }, [viewer?.department]);

  const showExpanded = mobileOpen || !collapsed;

  const handleLogout = () => {
    setError(null);
    setMessage(null);

    startLogoutTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const { error: signOutError } = await supabase.auth.signOut();

          if (signOutError) {
            throw signOutError;
          }

          router.replace("/login");
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to sign out.");
        }
      })();
    });
  };

  const handleProfileSave = () => {
    if (!viewer) {
      return;
    }

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();

    if (!fullName || !email) {
      setError("Name and email are both required.");
      return;
    }

    setError(null);
    setMessage(null);

    startSaveTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const { data, error: updateError } = await supabase.auth.updateUser({
            email: email !== viewer.email ? email : undefined,
            data: {
              ...viewer.metadata,
              full_name: fullName
            }
          });

          if (updateError) {
            throw updateError;
          }

          const updatedUser = data.user ?? {
            id: viewer.id,
            email: viewer.email,
            user_metadata: {
              ...viewer.metadata,
              full_name: fullName
            }
          };
          const nextViewer = buildViewer(updatedUser);
          setViewer(nextViewer);
          setForm({
            fullName: nextViewer.fullName,
            email: nextViewer.email
          });
          setEditorOpen(false);
          setMessage(
            email !== viewer.email
              ? "Profile updated. If email confirmations are enabled, complete the inbox confirmation for your new address."
              : "Profile updated."
          );
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to update your profile.");
        }
      })();
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar overlay"
        onClick={onCloseMobile}
        className={cn(
          "fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-all duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:self-start lg:flex-shrink-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-[5.5rem]" : "lg:w-80",
          "w-[min(20rem,100vw)]"
        )}
      >
        <div className="flex h-full flex-col overflow-hidden border-r border-white/10 bg-ink text-white shadow-2xl lg:shadow-none">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
            <div className={cn("space-y-1", !showExpanded && "lg:hidden")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Kian Falcon</p>
              <p className="text-lg font-semibold text-white">Workflow Tracker</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className={cn(
                  "hidden items-center justify-center rounded-full border border-white/10 text-xs font-semibold text-white/75 transition hover:border-gold hover:text-gold lg:inline-flex",
                  collapsed ? "h-11 w-11" : "gap-2 px-4 py-2"
                )}
              >
                {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
                {!collapsed ? <span>Collapse</span> : null}
              </button>
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:border-gold hover:text-gold lg:hidden"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
            <section className="space-y-3">
              <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45", !showExpanded && "lg:hidden")}>
                Navigation
              </p>
              <nav className="space-y-2">
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={cn(
                        "group flex items-center rounded-[22px] py-3 transition",
                        showExpanded ? "gap-3 px-3" : "justify-center px-0",
                        isActive
                          ? "bg-white text-ink"
                          : "text-white/75 hover:bg-white/8 hover:text-white"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold",
                          isActive
                            ? "border-ink/10 bg-sand text-ink"
                            : "border-white/10 bg-white/5 text-white/80"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>

                      <span className={cn("min-w-0 flex-1", !showExpanded && "lg:hidden")}>
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span
                          className={cn(
                            "block truncate text-xs",
                            isActive ? "text-ink/55" : "text-white/45"
                          )}
                        >
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </section>
          </div>

          <section className="border-t border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white">
                  {getInitials(viewer?.fullName ?? "Workflow user")}
                </div>

                <div className={cn("min-w-0 flex-1 space-y-1", !showExpanded && "lg:hidden")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Signed in as</p>
                  <p className="truncate text-sm font-semibold text-white">{viewer?.fullName ?? "Loading..."}</p>
                  <p className="truncate text-sm text-white/65">{viewer?.email ?? "Fetching session..."}</p>
                </div>
              </div>

              {showExpanded ? (
                <>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Team</p>
                    <p className="mt-1 text-sm font-medium text-white">{viewer?.department ?? "Unassigned"}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorOpen((value) => !value);
                        setError(null);
                        setMessage(null);
                      }}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold hover:text-gold"
                    >
                      {editorOpen ? "Hide profile" : "Edit profile"}
                    </button>

                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={logoutPending}
                      className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {logoutPending ? "Signing out..." : "Logout"}
                    </button>
                  </div>

                  {editorOpen ? (
                    <div className="mt-4 space-y-4 rounded-[24px] border border-white/10 bg-black/10 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Update your profile</p>
                        <p className="text-xs leading-6 text-white/55">
                          Multiple people can share the same department, so your name and email help identify who is
                          making updates.
                        </p>
                      </div>

                      <label className="block space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Name</span>
                        <input
                          value={form.fullName}
                          onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-gold"
                          placeholder="Your full name"
                        />
                      </label>

                      <label className="block space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Email</span>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-gold"
                          placeholder="name@company.com"
                        />
                      </label>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={handleProfileSave}
                          disabled={savePending || !viewer}
                          className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savePending ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForm({
                              fullName: viewer?.fullName ?? "",
                              email: viewer?.email ?? ""
                            });
                            setEditorOpen(false);
                            setError(null);
                          }}
                          className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {message ? <p className="mt-4 rounded-2xl bg-pine/20 px-3 py-2 text-sm text-white">{message}</p> : null}
                  {error ? <p className="mt-4 rounded-2xl bg-ember/20 px-3 py-2 text-sm text-white">{error}</p> : null}
                </>
              ) : (
                <div className="mt-4 hidden lg:block">
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={logoutPending}
                    aria-label="Logout"
                    title="Logout"
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white transition hover:border-gold hover:text-gold disabled:opacity-60"
                  >
                    <LogoutIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
