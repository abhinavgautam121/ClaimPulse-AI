"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Radio,
  Play,
  Pause,
  Square,
  RefreshCw,
  Activity,
  Files,
  Wallet,
  FileX2,
  UploadCloud,
  Upload,
  Download,
  Database,
  Link2,
  Webhook,
  Globe,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  LoaderCircle,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  Copy,
  Check,
} from "lucide-react";
import { api, post, download } from "@/services/api";
import {
  PageHeader,
  Panel,
  Stat,
  Loading,
  ErrorState,
  Badge,
  Status,
  useData,
  Insight,
  Empty,
  MetricNote,
  queryString,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { money, number, dateLabel } from "@/lib/utils";
export function LiveMonitorPage() {
  const qc = useQueryClient();
  const {
    data: sim,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["simulator"],
    queryFn: () => api("/simulator"),
    refetchInterval: 3000,
  });
  const { data: events = [] } = useQuery({
    queryKey: ["activity"],
    queryFn: () => api("/activity?limit=50"),
    refetchInterval: 5000,
  });
  const { data: metrics } = useData("/analytics/dashboard");
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/auth/me"),
  });
  const [interval, setIntervalValue] = useState(3),
    [target, setTarget] = useState(20),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("");
  const control = async (action: string) => {
    setBusy(true);
    try {
      await post("/simulator", { action, interval, target });
      qc.invalidateQueries();
      toast.success(
        action === "start"
          ? "Synthetic simulator started."
          : action === "pause"
            ? "Simulator paused."
            : "Simulator stopped.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const k = metrics?.kpis;
  return (
    <>
      <PageHeader
        eyebrow="REAL-TIME OPERATIONS"
        title="Your claims, as they move."
        description="Watch synthetic lifecycle events update the shared workspace."
        date={false}
      >
        <Badge
          tone={
            sim.state === "running"
              ? "teal"
              : sim.state === "paused"
                ? "amber"
                : "gray"
          }
        >
          <span className="tiny-dot" />
          {sim.state === "running"
            ? "Simulation running"
            : sim.state === "paused"
              ? "Simulation paused"
              : "Simulation stopped"}
        </Badge>
      </PageHeader>
      <Insight>
        <strong>Clearly simulated</strong>
        <span>
          Events below are generated for this portfolio demo. There is no live
          insurer or healthcare-provider connection. Each change is persisted
          and broadcast through WebSockets.
        </span>
      </Insight>
      <div className="stats-grid four">
        <Stat
          label="Claims generated"
          value={sim.generated}
          footnote={`Target: ${sim.target} this session`}
          icon={Files}
        />
        <Stat
          label="Lifecycle events"
          value={sim.events}
          footnote="This simulation session"
          icon={Activity}
        />
        <Stat
          label="Cohort denial rate"
          value={k ? k.denial_rate + "%" : "—"}
          footnote="Current reporting period"
          icon={FileX2}
        />
        <Stat
          label="Cohort outstanding"
          value={k ? money(k.outstanding, true) : "—"}
          footnote="Current reporting period"
          icon={Wallet}
        />
      </div>
      <div className="two-column">
        <Panel
          title="Live activity feed"
          description="Persisted events · most recent first"
          action={
            <select
              style={{ fontSize: 10, padding: 6 }}
              aria-label="Event source filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All sources</option>
              <option>Synthetic Simulator</option>
              <option>Uploaded CSV</option>
              <option>Application</option>
              <option>Connected API</option>
              <option>Webhook Integration</option>
            </select>
          }
        >
          <div className="activity-feed">
            {events
              .filter((e: any) => !filter || e.source === filter)
              .map((e: any) => (
                <div className="activity-item" key={e.id}>
                  <span>
                    {e.kind === "created" ? (
                      <Files size={15} />
                    ) : e.kind === "updated" ? (
                      <RefreshCw size={15} />
                    ) : (
                      <Activity size={15} />
                    )}
                  </span>
                  <div>
                    <strong>
                      <Link
                        href={"/claims/" + e.claim_id}
                        className="claim-link"
                      >
                        {e.claim_id}
                      </Link>{" "}
                      · {e.message}
                    </strong>
                    <p>
                      {e.source}
                      <span className="meta-dot">·</span>Synthetic record
                    </p>
                  </div>
                  <time>
                    {new Date(e.created_at).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            {!events.length && (
              <Empty
                title="No activity yet"
                description="Start the simulator or create a claim to see events."
              />
            )}
          </div>
        </Panel>
        <div className="stack">
          <Panel
            title="Synthetic simulator"
            description="Realistic claim creation, processing, denial and recovery"
          >
            <div className="simulator-controls">
              <label>
                Event frequency
                <select
                  value={interval}
                  onChange={(e) => setIntervalValue(Number(e.target.value))}
                >
                  {[1, 2, 3, 5, 10, 30, 60].map((n) => (
                    <option value={n} key={n}>
                      Every {n} second{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Number of new claims
                <input
                  aria-label="Number of generated claims"
                  type="number"
                  min="1"
                  max="1000"
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                />
              </label>
              <div className="row">
                <Button
                  size="sm"
                  onClick={() => control("start")}
                  disabled={
                    busy || sim.state === "running" || user?.role !== "admin"
                  }
                >
                  <Play size={13} />
                  {sim.state === "paused" ? "Resume" : "Start"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    busy || sim.state !== "running" || user?.role !== "admin"
                  }
                  onClick={() => control("pause")}
                >
                  <Pause size={13} />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    busy || sim.state === "stopped" || user?.role !== "admin"
                  }
                  onClick={() => control("stop")}
                >
                  <Square size={12} />
                  Stop
                </Button>
              </div>
              <p className="form-help" style={{ gridColumn: "1/-1" }}>
                Frequency and count apply when starting/resuming. Stop halts
                future events; already persisted claims stay in the workspace.{" "}
                {user?.role !== "admin"
                  ? "An administrator can control the simulator."
                  : ""}
              </p>
            </div>
          </Panel>
          <Panel
            title="Event lifecycle"
            description="A bounded background worker processes validated transitions"
          >
            <div className="timeline">
              {[
                "Submitted → Processing",
                "Processing → Paid or Denied",
                "Denied → Appealed",
                "Appealed → Recovered",
              ].map((v) => (
                <div className="timeline-item" key={v}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{v}</strong>
                    <p>
                      Validated, persisted and broadcast to connected sessions.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <MetricNote />
    </>
  );
}
export function DataIngestionPage() {
  const qc = useQueryClient();
  const {
    data: sources = [],
    isPending,
    error,
    refetch,
  } = useQuery({ queryKey: ["sources"], queryFn: () => api("/data-sources") });
  const { data: system } = useQuery({
    queryKey: ["system"],
    queryFn: () => api("/system"),
  });
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/auth/me"),
  });
  const [busy, setBusy] = useState(false),
    [job, setJob] = useState<any>(null),
    [drag, setDrag] = useState(false),
    [tab, setTab] = useState("CSV upload"),
    [jsonBody, setJsonBody] = useState('{\n  "records": []\n}'),
    [syncing, setSyncing] = useState(""),
    [refResult, setRefResult] = useState<any>(null),
    [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Maximum CSV size is 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/ingestion/csv", {
        method: "POST",
        body: form,
      });
      setJob(result);
      qc.invalidateQueries();
      toast.success(`${result.valid} valid records imported.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const sync = async (source: string) => {
    setSyncing(source);
    try {
      const result = await post(
        source === "fhir" ? "/ingestion/fhir" : "/reference-sync/" + source,
      );
      if (source === "fhir") setJob(result);
      else setRefResult(result);
      qc.invalidateQueries();
      toast.success(
        source === "fhir" ? "FHIR sync finished." : "Reference data fetched.",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing("");
    }
  };
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + "/api/ingestion/webhook",
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard is unavailable. Copy the endpoint shown below.");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="DATA WORKSPACE"
        title="Good intelligence starts with good data."
        description="Ingest synthetic records through validated, traceable data pipelines."
        date={false}
      >
        <Button
          variant="outline"
          onClick={() =>
            download("/ingestion/template", "claimpulse-template.csv")
          }
        >
          <Download size={14} />
          CSV template
        </Button>
      </PageHeader>
      <div className="tabs">
        {["CSV upload", "REST API", "Webhook", "Reference & FHIR"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="two-column">
        <Panel
          title={
            tab === "CSV upload"
              ? "Import synthetic claims"
              : tab === "REST API"
                ? "Submit an API batch"
                : tab === "Webhook"
                  ? "Signed webhook ingestion"
                  : "Authorised integrations"
          }
          description="Extract → validate → transform → deduplicate → load → notify"
        >
          <div className="panel-body">
            {tab === "CSV upload" ? (
              <>
                <div
                  className={"upload-zone " + (drag ? "dragging" : "")}
                  role="button"
                  tabIndex={0}
                  onClick={() => !busy && input.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      input.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    const f = e.dataTransfer.files[0];
                    if (f) upload(f);
                  }}
                >
                  <span>
                    {busy ? (
                      <LoaderCircle size={25} className="spin" />
                    ) : (
                      <UploadCloud size={26} />
                    )}
                  </span>
                  <strong>
                    {busy
                      ? "Validating and importing…"
                      : "Drop your claims CSV here"}
                  </strong>
                  <p>
                    or <span className="text-link">browse files</span>
                    <br />
                    UTF-8 CSV · Up to 10 MB and 10,000 rows
                  </p>
                  <small>Synthetic patient references only (SYN-…)</small>
                  <input
                    ref={input}
                    aria-label="Upload claims CSV"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(f);
                    }}
                  />
                </div>
                <p className="form-help" style={{ marginTop: 18 }}>
                  Required columns: id, patient_id, provider_id, payer_id,
                  submission_date, service_date, amount. Status defaults to
                  Submitted. Duplicate IDs are reported and never overwrite
                  existing claims. Unknown columns are rejected.
                </p>
              </>
            ) : tab === "REST API" ? (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const data = JSON.parse(jsonBody);
                    const result = await post("/ingestion/rest", data);
                    setJob(result);
                    qc.invalidateQueries();
                    toast.success("Batch processed.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <p className="form-help">
                  POST /api/ingestion/rest with an authenticated session or
                  Bearer JWT. Uses the same validation and duplicate detection
                  as CSV.
                </p>
                <label>
                  JSON batch
                  <textarea
                    aria-label="REST batch JSON"
                    value={jsonBody}
                    onChange={(e) => setJsonBody(e.target.value)}
                    spellCheck={false}
                    style={{
                      fontFamily: "monospace",
                      minHeight: 230,
                      fontSize: 11,
                    }}
                  />
                </label>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  Validate & ingest
                </Button>
                <Button asChild variant="outline">
                  <a href="/api/docs" target="_blank" rel="noreferrer">
                    Open interactive API docs <ArrowUpRight size={13} />
                  </a>
                </Button>
              </form>
            ) : tab === "Webhook" ? (
              <div className="stack">
                <Badge tone={system?.webhook_configured ? "teal" : "amber"}>
                  {system?.webhook_configured
                    ? "Signing key configured"
                    : "Signing key not configured"}
                </Badge>
                <p className="form-help">
                  Set WEBHOOK_SECRET on the server. This endpoint is disabled
                  until configured; there is no insurer connected by default.
                </p>
                <code className="code-block">
                  POST /api/ingestion/webhook{`\n`}X-CP-Timestamp: Unix seconds
                  {`\n`}X-CP-Signature: HMAC-SHA256(secret, timestamp + "." +
                  raw_body){`\n\n`}
                  {'{"records": [...synthetic claims...]}'}
                </code>
                <p className="form-help">
                  Requests must be signed within 5 minutes. Claim IDs provide
                  idempotent deduplication. Never send real patient data to this
                  demo.
                </p>
                <Button variant="outline" onClick={copy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                  {copied ? "Endpoint copied" : "Copy webhook endpoint"}
                </Button>
              </div>
            ) : (
              <div className="stack">
                <div>
                  <strong style={{ fontSize: 12 }}>
                    FHIR R4 Claim adapter
                  </strong>
                  <p className="form-help" style={{ marginTop: 8 }}>
                    Configure an authorised HTTPS FHIR_BASE_URL and optional
                    FHIR_TOKEN on the server. The demo accepts only resources
                    with urn:claimpulse:synthetic identifiers and SYN- patient
                    references. Polling interval: {system?.poll_seconds}{" "}
                    seconds.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ marginTop: 12 }}
                    disabled={!!syncing || user?.role !== "admin"}
                    onClick={() => sync("fhir")}
                  >
                    {syncing === "fhir" ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    Sync authorised FHIR source
                  </Button>
                </div>
                <div>
                  <strong style={{ fontSize: 12 }}>
                    Public reference adapters
                  </strong>
                  <p className="form-help" style={{ marginTop: 8 }}>
                    CMS catalog and NPPES organisation registry provide
                    reference metadata. They do not provide live individual
                    claim denials. Fetched references are stored separately from
                    the synthetic claims.
                  </p>
                  <div
                    className="row"
                    style={{ marginTop: 12, flexWrap: "wrap" }}
                  >
                    {["cms", "nppes"].map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        disabled={!!syncing || user?.role !== "admin"}
                        onClick={() => sync(s)}
                      >
                        {syncing === s ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : (
                          <Globe size={13} />
                        )}
                        Fetch {s.toUpperCase()} references
                      </Button>
                    ))}
                  </div>
                </div>
                {refResult && (
                  <div>
                    <Badge tone="teal">{refResult.source}</Badge>
                    <p className="form-help" style={{ marginTop: 9 }}>
                      {refResult.note}
                    </p>
                    <div
                      className="code-block"
                      style={{ marginTop: 10, maxHeight: 300 }}
                    >
                      {JSON.stringify(refResult.records, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            )}
            {job && (
              <div className="result-summary">
                <CheckCircle2 size={23} className="text-teal" />
                <div>
                  <strong>Import #{job.id} processed</strong>
                  <p>
                    {job.valid} valid · {job.rejected} rejected ·{" "}
                    {job.duplicates} duplicates
                  </p>
                </div>
                {job.errors?.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      download(
                        "/ingestion/" + job.id + "/errors",
                        "ingestion-errors.csv",
                      )
                    }
                  >
                    Error report
                  </Button>
                )}
              </div>
            )}
          </div>
        </Panel>
        <div className="stack">
          <Panel
            title="Data sources"
            description="Connection state and last successful sync"
          >
            <div className="source-list">
              {sources.map((s: any, i: number) => (
                <div className="source-item" key={s.id}>
                  <span className="source-icon">
                    {i === 0 ? (
                      <Activity size={16} />
                    ) : i === 1 ? (
                      <Files size={16} />
                    ) : i === 3 ? (
                      <Webhook size={16} />
                    ) : (
                      <Database size={16} />
                    )}
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <p>
                      {s.last_sync
                        ? "Last sync " + dateLabel(s.last_sync)
                        : i === 1
                          ? "Ready for CSV uploads"
                          : i === 2
                            ? "Authenticated batch endpoint"
                            : "No successful sync yet"}
                    </p>
                  </div>
                  <Badge
                    tone={
                      s.last_sync
                        ? "teal"
                        : s.status === "error"
                          ? "red"
                          : "gray"
                    }
                  >
                    {s.status === "error"
                      ? "Error"
                      : s.last_sync
                        ? "Ready"
                        : i === 1 || i === 2
                          ? "Available"
                          : "Not connected"}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Validation built in">
            <div className="panel-body stack" style={{ gap: 12 }}>
              {[
                "Positive, reconciled financial amounts",
                "Valid dates and synthetic references",
                "Known payer and provider foreign keys",
                "Consistent claim states and denial history",
                "Duplicate records reported separately",
                "Per-row error reports for rejected data",
              ].map((v) => (
                <div
                  className="row"
                  key={v}
                  style={{ fontSize: 10, color: "#91a2b7", gap: 8 }}
                >
                  <ShieldCheck size={14} color="#70aa99" />
                  {v}
                </div>
              ))}
              <Button asChild variant="outline" size="sm">
                <Link href="/data-quality">
                  Open data quality dashboard <ArrowRight size={13} />
                </Link>
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
export function DataQualityPage() {
  const {
    data: d,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["data-quality"],
    queryFn: () => api("/data-quality"),
  });
  const [expanded, setExpanded] = useState<number | null>(null);
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <PageHeader
        eyebrow="DATA OBSERVABILITY"
        title="Trust the data behind the decision."
        description="Trace ingestion jobs, validation failures and duplicate records."
        date={false}
      >
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw size={14} />
          Refresh
        </Button>
        <Button asChild>
          <Link href="/data-ingestion">
            <Upload size={14} />
            Import data
          </Link>
        </Button>
      </PageHeader>
      <div className="stats-grid four">
        <Stat
          label="Records processed"
          value={number(d.totals.total)}
          footnote="CSV, REST, webhook and FHIR jobs"
          icon={Database}
        />
        <Stat
          label="Valid records loaded"
          value={number(d.totals.valid)}
          icon={CheckCircle2}
        />
        <Stat
          label="Rejected records"
          value={number(d.totals.rejected)}
          icon={AlertCircle}
          accent
        />
        <Stat
          label="Duplicate records"
          value={number(d.totals.duplicates)}
          icon={Files}
        />
      </div>
      <Insight>
        <strong>Workspace integrity</strong>
        <span>
          {number(d.stored_claims)} persisted synthetic claims.{" "}
          {number(d.totals.missing)} imported rows had missing required values.
          Seeded records are separate from the ingestion-job totals above.
        </span>
      </Insight>
      <Panel
        title="Ingestion history"
        description="Most recent 100 jobs; totals include all jobs"
      >
        {d.jobs.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Job / source",
                    "Created",
                    "Status",
                    "Processed",
                    "Valid",
                    "Rejected",
                    "Duplicates",
                    "Errors",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.jobs.map((j: any) => (
                  <tr key={j.id}>
                    <td>
                      <strong>
                        #{j.id} · {j.filename}
                      </strong>
                    </td>
                    <td>{dateLabel(j.created_at)}</td>
                    <td>
                      <Badge
                        tone={
                          j.rejected || j.status === "failed" ? "amber" : "teal"
                        }
                      >
                        {j.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td>{j.total}</td>
                    <td className="text-teal">{j.valid}</td>
                    <td className={j.rejected ? "text-red" : ""}>
                      {j.rejected}
                    </td>
                    <td>{j.duplicates}</td>
                    <td>
                      {j.errors?.length ? (
                        <div className="row">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setExpanded(expanded === j.id ? null : j.id)
                            }
                          >
                            View ({j.errors.length})
                          </Button>
                          <Button
                            aria-label={"Download errors for job " + j.id}
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              download(
                                "/ingestion/" + j.id + "/errors",
                                "job-" + j.id + "-errors.csv",
                              )
                            }
                          >
                            <Download size={12} />
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No ingestion jobs yet"
            description="Import a synthetic CSV or API batch to see validation results and error reports."
          >
            <Button asChild variant="outline">
              <Link href="/data-ingestion">
                Import synthetic data <ArrowRight size={14} />
              </Link>
            </Button>
          </Empty>
        )}
      </Panel>
      {expanded !== null && (
        <Panel
          title={"Validation report · Job #" + expanded}
          description="Rejected row values are not retained; only validation messages are stored."
          className="mt-5"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Claim</th>
                  <th>Type</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {d.jobs
                  .find((j: any) => j.id === expanded)
                  ?.errors.map((e: any, i: number) => (
                    <tr key={i}>
                      <td>{e.row ?? "—"}</td>
                      <td>{e.claim_id || "—"}</td>
                      <td>
                        <Badge tone="amber">{e.type || "request"}</Badge>
                      </td>
                      <td style={{ whiteSpace: "normal", lineHeight: 1.8 }}>
                        {e.error}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
