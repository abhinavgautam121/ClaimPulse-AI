"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileBarChart,
  Files,
  FileX2,
  Building2,
  ShieldAlert,
  Hourglass,
  BadgeDollarSign,
  Download,
  Printer,
  Settings,
  ShieldCheck,
  Bell,
  Sun,
  Moon,
  Save,
  RefreshCw,
  Activity,
  Info,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import { api, post, download } from "@/services/api";
import {
  PageHeader,
  Panel,
  Stat,
  Loading,
  ErrorState,
  Badge,
  useData,
  queryString,
  MetricNote,
  Empty,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { usePeriod } from "@/components/providers";
import { money, number, dateLabel } from "@/lib/utils";
const reports = [
  [
    "claims",
    "Claims ledger",
    "Export the claim-level financial ledger, status and outstanding balance.",
    Files,
  ],
  [
    "denials",
    "Denial root causes",
    "Counts, denied expected reimbursement and cumulative share by reason.",
    FileX2,
  ],
  [
    "payers",
    "Payer performance",
    "Compare denial rates, reimbursement and recovery across payers.",
    Building2,
  ],
  [
    "revenue-risk",
    "Revenue at risk",
    "Outstanding claims flagged by denial state or age above 90 days.",
    ShieldAlert,
  ],
  [
    "aging",
    "A/R ageing",
    "Net outstanding balances and claim counts across five ageing buckets.",
    Hourglass,
  ],
  [
    "recovery",
    "Revenue recovery",
    "Recovered payments grouped by claim submission cohort.",
    BadgeDollarSign,
  ],
] as const;
export function ReportsPage() {
  const { period } = usePeriod();
  const {
    data: d,
    isPending,
    error,
    refetch,
  } = useData("/analytics/dashboard");
  const [payer, setPayer] = useState("");
  const { data: refs } = useQuery({
    queryKey: ["references"],
    queryFn: () => api("/references"),
  });
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <PageHeader
        eyebrow="REPORTING WORKSPACE"
        title="From insight to a shared view."
        description="Export reproducible reports and the definitions behind every metric."
      >
        <Button
          variant="outline"
          onClick={() => download("/source", "claimpulse-ai.zip")}
        >
          <Download size={14} />
          Download source
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={14} />
          Print executive report
        </Button>
      </PageHeader>
      <div
        className="filter-toolbar"
        style={{ paddingLeft: 0, border: 0, marginBottom: 12 }}
      >
        <span className="form-help">CSV payer filter</span>
        <select
          aria-label="Report payer filter"
          value={payer}
          onChange={(e) => setPayer(e.target.value)}
        >
          <option value="">All payers</option>
          {refs?.payers.map((p: any) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="form-help">
          {dateLabel(period.start)} – {dateLabel(period.end)} · Submission date
          · USD
        </span>
      </div>
      <div className="report-cards">
        {reports.map(([key, title, description, Icon]) => (
          <div className="report-card" key={key}>
            <Icon size={25} />
            <h3>{title}</h3>
            <p>{description}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download(
                  "/exports/" +
                    key +
                    "?" +
                    queryString({ ...period, payer_id: payer }),
                  "claimpulse-" + key + ".csv",
                )
              }
            >
              <Download size={13} />
              Download CSV
            </Button>
          </div>
        ))}
      </div>
      <Panel
        title="Metric definitions"
        description="One definition shared by the API, dashboard, exports and Copilot"
      >
        <div className="metric-definitions">
          {Object.entries(d.definitions).map(([key, text]) => (
            <div key={key}>
              <strong>{key.replaceAll("_", " ")}</strong>
              <p>{String(text)}</p>
            </div>
          ))}
        </div>
      </Panel>
      <section className="print-report">
        <h2>ClaimPulse AI · Executive report</h2>
        <p>
          {dateLabel(period.start)} – {dateLabel(period.end)} · All synthetic
          payers · Submission date cohort · USD
        </p>
        <p>
          Independent synthetic portfolio data. Review exposure and model
          estimates are not guaranteed losses, recoveries or payer decisions.
        </p>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(d.kpis).map(([key, value]) => (
              <tr key={key}>
                <td>{key.replaceAll("_", " ")}</td>
                <td>
                  {typeof value === "number"
                    ? key.includes("rate")
                      ? value + "%"
                      : [
                            "billed",
                            "outstanding",
                            "revenue_at_risk",
                            "paid",
                            "recovered",
                            "underpayment",
                          ].includes(key)
                        ? money(value)
                        : number(value)
                    : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Payer summary</h2>
        <table>
          <thead>
            <tr>
              <th>Payer</th>
              <th>Adjudicated</th>
              <th>Denial rate</th>
              <th>Outstanding</th>
              <th>Reimbursement days</th>
            </tr>
          </thead>
          <tbody>
            {d.payers.map((p: any) => (
              <tr key={p.payer_id}>
                <td>{p.payer}</td>
                <td>{number(p.adjudicated_claims)}</td>
                <td>{p.denial_rate}%</td>
                <td>{money(p.outstanding)}</td>
                <td>{p.avg_reimbursement_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <MetricNote />
    </>
  );
}
export function SettingsPage() {
  const qc = useQueryClient();
  const {
    data: user,
    isPending,
    error,
    refetch,
  } = useQuery({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const { data: system } = useQuery({
    queryKey: ["system"],
    queryFn: () => api("/system"),
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/auth/users"),
  });
  const [tab, setTab] = useState("Preferences"),
    [busy, setBusy] = useState(false),
    [scanning, setScanning] = useState(false),
    [form, setForm] = useState({
      high_value: 10000,
      aging_days: 90,
      deadline_days: 7,
      denial_increase: 5,
      pattern_count: 10,
      dark_mode: false,
    });
  const { data: audit = [], refetch: refreshAudit } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api("/audit-logs"),
    enabled: tab === "Audit history" && user?.role === "admin",
  });
  useEffect(() => {
    if (user)
      setForm((f) => ({
        ...f,
        ...user.preferences?.thresholds,
        dark_mode: !!user.preferences?.dark_mode,
      }));
  }, [user]);
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE SETTINGS"
        title="Make the workspace work for you."
        description="Configure review thresholds, preferences and workspace visibility."
        date={false}
      />
      <div className="tabs">
        {["Preferences", "Team", "Audit history"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Preferences" ? (
        <div className="settings-grid">
          <div className="stack">
            <Panel
              title="Alert thresholds"
              description="Used when evaluating new/updated claims and when refreshing alerts"
            >
              <form
                className="settings-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await api("/settings", {
                      method: "PUT",
                      body: JSON.stringify(form),
                    });
                    qc.invalidateQueries({ queryKey: ["me"] });
                    toast.success("Workspace preferences saved.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="form-grid">
                  <label>
                    High-value denial ($)
                    <input
                      type="number"
                      min="100"
                      max="10000000"
                      value={form.high_value}
                      onChange={(e) =>
                        setForm({ ...form, high_value: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Ageing alert (days)
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.aging_days}
                      onChange={(e) =>
                        setForm({ ...form, aging_days: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Appeal deadline warning (days)
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={form.deadline_days}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          deadline_days: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Denial rate increase (pp)
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={form.denial_increase}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          denial_increase: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Recurring reason threshold (claims)
                    <input
                      type="number"
                      min="2"
                      max="10000"
                      value={form.pattern_count}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          pattern_count: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="settings-line">
                  <div>
                    <strong>Dark appearance</strong>
                    <p>Apply a darker theme to your workspace.</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Toggle dark mode"
                    role="switch"
                    aria-checked={form.dark_mode}
                    className={"toggle " + (form.dark_mode ? "on" : "")}
                    onClick={() => {
                      const dark = !form.dark_mode;
                      setForm({ ...form, dark_mode: dark });
                      document.documentElement.dataset.theme = dark
                        ? "dark"
                        : "light";
                    }}
                  >
                    <i />
                  </button>
                </div>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  Save preferences
                </Button>
              </form>
            </Panel>
            <Panel
              title="Refresh analytical alerts"
              description="Evaluate current ageing, deadlines and recurring denial patterns"
            >
              <div className="panel-body">
                <p className="form-help">
                  Save thresholds first. Pattern alerts compare the most recent
                  7-day submission cohort with the preceding 7 days; a
                  denial-rate alert requires at least 30 adjudicated claims in
                  each.
                </p>
                <Button
                  style={{ marginTop: 15 }}
                  variant="outline"
                  disabled={scanning}
                  onClick={async () => {
                    setScanning(true);
                    try {
                      const r = await post("/notifications/refresh");
                      qc.invalidateQueries({ queryKey: ["notifications"] });
                      toast.success(
                        `Alerts refreshed. ${r.pattern_alerts} pattern alerts generated.`,
                      );
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setScanning(false);
                    }
                  }}
                >
                  {scanning ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Refresh alerts
                </Button>
              </div>
            </Panel>
          </div>
          <div className="stack">
            <Panel
              title="Workspace details"
              description="Current runtime configuration"
            >
              <div className="system-details">
                {[
                  ["Workspace", "Westlake Medical (synthetic)"],
                  ["Account", user.email],
                  ["Access role", user.role],
                  ["Database", system?.database],
                  ["AI intent provider", system?.ai_provider],
                  [
                    "FHIR endpoint",
                    system?.fhir_configured ? "Configured" : "Not configured",
                  ],
                  [
                    "Webhook signing key",
                    system?.webhook_configured
                      ? "Configured"
                      : "Not configured",
                  ],
                  [
                    "Synthetic demo access",
                    system?.demo_mode ? "Enabled" : "Disabled",
                  ],
                  ["Version", system?.version],
                ].map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{value || "—"}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Privacy by design">
              <div className="panel-body stack" style={{ gap: 12 }}>
                <ShieldCheck size={26} color="#82a496" />
                <p className="form-help">
                  This shared portfolio workspace accepts synthetic records
                  only. It does not store names, dates of birth, addresses or
                  real clinical patient details.
                </p>
                <p className="form-help">
                  No HIPAA certification or compliance claim is made. Production
                  healthcare use requires separate legal, security,
                  organisational and contractual controls.
                </p>
                <p className="form-help">
                  Integration secrets are configured through server environment
                  variables and are never displayed in the application.
                </p>
              </div>
            </Panel>
          </div>
        </div>
      ) : tab === "Team" ? (
        <Panel
          title="Workspace team"
          description="Registered accounts have analyst permissions; synthetic demo access is administrative."
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Workspace</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <Badge tone={u.role === "admin" ? "blue" : "gray"}>
                        {u.role}
                      </Badge>
                    </td>
                    <td>Shared synthetic workspace</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel
          title="Audit history"
          description="Most recent 100 server-recorded workspace actions"
          action={
            user.role === "admin" ? (
              <Button size="sm" variant="ghost" onClick={() => refreshAudit()}>
                <RefreshCw size={13} />
                Refresh
              </Button>
            ) : null
          }
        >
          {user.role === "admin" ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a: any) => (
                    <tr key={a.id}>
                      <td>{dateLabel(a.created_at)}</td>
                      <td>
                        <strong>{a.action.replaceAll("_", " ")}</strong>
                      </td>
                      <td>{a.entity}</td>
                      <td>
                        {users.find((u: any) => u.id === a.user_id)?.name ||
                          "System"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Administrator access required"
              description="Audit logs are visible to workspace administrators."
            />
          )}
        </Panel>
      )}
    </>
  );
}
