"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Activity,
  LayoutDashboard,
  Files,
  ChartNoAxesCombined,
  ShieldAlert,
  ListTodo,
  Building2,
  Coins,
  BrainCircuit,
  Sparkles,
  Radio,
  Database,
  ShieldCheck,
  FileBarChart,
  Settings,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  LogOut,
  ArrowUpRight,
  ChevronRight,
  X,
  CheckCheck,
  Menu,
  Plus,
  Command,
} from "lucide-react";
import { api, post, APIError } from "@/services/api";
import { useLive } from "@/hooks/use-live";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
const groups = [
  {
    label: "WORKSPACE",
    items: [
      ["dashboard", "Overview", LayoutDashboard],
      ["claims", "Claims", Files],
      ["denials", "Denial analysis", ChartNoAxesCombined],
      ["revenue-risk", "Revenue at risk", ShieldAlert],
      ["claim-prioritisation", "Priority worklist", ListTodo],
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      ["payer-performance", "Payer performance", Building2],
      ["underpayments", "Underpayments", Coins],
      ["predictive-analytics", "Denial prediction", BrainCircuit],
      ["copilot", "ClaimPulse Copilot", Sparkles],
    ],
  },
  {
    label: "DATA & OPERATIONS",
    items: [
      ["live-monitor", "Live monitor", Radio],
      ["data-ingestion", "Data ingestion", Database],
      ["data-quality", "Data quality", ShieldCheck],
      ["reports", "Reports", FileBarChart],
    ],
  },
];
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/dashboard" className="logo">
      <span className="logo-mark">
        <Activity size={small ? 21 : 23} strokeWidth={2.5} />
      </span>
      {!small && (
        <>
          <span>
            ClaimPulse<span className="logo-ai">AI</span>
          </span>
        </>
      )}
    </Link>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    qc = useQueryClient();
  const auth = path === "/login" || path === "/register";
  const {
    data: user,
    error,
    isPending,
  } = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/auth/me"),
    retry: false,
    enabled: !auth,
  });
  const live = useLive(!!user && !auth);
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(""),
    [notifications, setNotifications] = useState(false),
    [profile, setProfile] = useState(false);
  const { data: alerts = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<any[]>("/notifications"),
    enabled: !!user && !auth,
    refetchInterval: 60000,
  });
  useEffect(() => {
    if (error instanceof APIError && error.status === 401)
      router.replace("/login");
  }, [error, router]);
  useEffect(() => {
    if (user)
      document.documentElement.dataset.theme = user.preferences?.dark_mode
        ? "dark"
        : "light";
  }, [user]);
  useEffect(() => {
    setMobile(false);
    setProfile(false);
  }, [path]);
  if (auth) return <>{children}</>;
  if (isPending || !user) {
    return (
      <div className="full-loader">
        <Logo />
        <div className="loader-line" />
        {error && !(error instanceof APIError && error.status === 401) ? (
          <>
            <p>Unable to connect to the workspace.</p>
            <Button onClick={() => qc.invalidateQueries({ queryKey: ["me"] })}>
              Try again
            </Button>
          </>
        ) : (
          <p>Opening your workspace…</p>
        )}
      </div>
    );
  }
  const current = groups
    .flatMap((g) => g.items)
    .find((i) => path.split("/")[1] === i[0]);
  const title = String(current?.[1] || "Claim details");
  return (
    <div
      className={`app-layout ${collapsed ? "sidebar-collapsed" : ""} ${mobile ? "mobile-open" : ""}`}
    >
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo small={collapsed} />
          <button
            className="collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <button
          className="workspace-switch"
          onClick={() => {
            setProfile((v) => !v);
          }}
          title="Open workspace menu"
        >
          <span className="workspace-icon">W</span>
          <span className="workspace-copy">
            <strong>Westlake Medical</strong>
            <small>Demo workspace</small>
          </span>
          <ChevronsUpDown size={14} />
        </button>
        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(([route, label, Icon]) => {
                const I = Icon as typeof Activity;
                return (
                  <Link
                    key={String(route)}
                    href={"/" + route}
                    title={String(label)}
                    className={`nav-link ${path.split("/")[1] === route ? "active" : ""}`}
                  >
                    <I size={18} />
                    <span>{String(label)}</span>
                    {route === "copilot" && <span className="new-tag">AI</span>}
                    {route === "live-monitor" && (
                      <span className={"nav-live-dot " + (live ? "on" : "")} />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="synthetic-note">
            <span className="synthetic-icon">
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>Built for exploration</strong>
              <p>100% synthetic claims data</p>
            </div>
          </div>
          <Link
            className={`nav-link ${path === "/settings" ? "active" : ""}`}
            href="/settings"
          >
            <Settings size={18} />
            <span>Settings</span>
          </Link>
          <button className="user-button" onClick={() => setProfile((v) => !v)}>
            <span className="avatar">
              {user.name
                .split(" ")
                .map((v: string) => v[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "admin" ? "Workspace admin" : "Analyst"}
              </small>
            </span>
            <ChevronsUpDown size={14} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                path === "/claims"
                  ? window.location.assign(
                      "/claims?q=" + encodeURIComponent(search),
                    )
                  : router.push("/claims?q=" + encodeURIComponent(search));
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search all claims"
                placeholder="Search claims…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <span className={"connection-pill " + (live ? "online" : "")}>
              <i />
              {live ? "Live updates" : "Reconnecting"}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotifications((v) => !v)}
            >
              <Bell size={19} />
              {alerts.some((a: any) => !a.read) && <i />}
            </button>
            <span className="header-divider" />
            <button
              className="avatar small"
              onClick={() => setProfile((v) => !v)}
              aria-label="User menu"
            >
              {user.name
                .split(" ")
                .map((v: string) => v[0])
                .join("")
                .slice(0, 2)}
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
        <footer className="app-footer">
          <span>
            <span className="tiny-dot" /> Synthetic demo · Independent portfolio
            project
          </span>
          <span>
            ClaimPulse AI <span className="muted">/</span> Healthcare
            intelligence, made clear.
          </span>
        </footer>
      </div>
      {profile && (
        <div className="profile-menu floating-panel">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
          <span className="badge blue">{user.role}</span>
          <Link href="/settings">
            <Settings size={16} /> Workspace settings
          </Link>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await post("/auth/logout");
                qc.clear();
                router.push("/login");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      )}
      {notifications && (
        <>
          <div
            className="popover-backdrop"
            onClick={() => setNotifications(false)}
          />
          <section className="notification-panel floating-panel">
            <div className="panel-title">
              <h3>
                Notifications{" "}
                <span className="count-badge">
                  {alerts.filter((a: any) => !a.read).length}
                </span>
              </h3>
              <button
                className="icon-button"
                aria-label="Close notifications"
                onClick={() => setNotifications(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="notification-tools">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await post("/notifications/read");
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }}
              >
                <CheckCheck size={14} />
                Mark all read
              </Button>
              <Link href="/settings" onClick={() => setNotifications(false)}>
                Thresholds <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className="notification-list">
              {alerts.length ? (
                alerts.map((a: any) => (
                  <Link
                    key={a.id}
                    href={
                      a.claim_id ? "/claims/" + a.claim_id : "/data-quality"
                    }
                    onClick={() => setNotifications(false)}
                    className={"notification-item " + (!a.read ? "unread" : "")}
                  >
                    <span
                      className={
                        "status-dot " +
                        (a.priority === "Critical" ? "red" : "amber")
                      }
                    />
                    <div>
                      <p>{a.title}</p>
                      <small>
                        {a.priority} priority ·{" "}
                        {new Date(a.created_at).toLocaleDateString()}
                      </small>
                    </div>
                    <ChevronRight size={14} />
                  </Link>
                ))
              ) : (
                <p className="empty-copy">
                  No alerts. Your workspace is up to date.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
