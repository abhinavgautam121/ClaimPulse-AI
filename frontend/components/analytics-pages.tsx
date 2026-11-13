"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Files,
  FileX2,
  ChartNoAxesCombined,
  Wallet,
  ShieldAlert,
  Clock3,
  Hourglass,
  BadgeDollarSign,
  Info,
  ArrowUpRight,
  Search,
  Filter,
  ArrowRight,
  CheckCircle2,
  Coins,
  Building2,
} from "lucide-react";
import {
  PageHeader,
  Stat,
  Panel,
  useData,
  Loading,
  ErrorState,
  Insight,
  TrendChart,
  AgingChart,
  ReasonDonut,
  ParetoChart,
  ClaimsTable,
  PayerMark,
  Badge,
  Priority,
  Status,
  MetricNote,
  Empty,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { money, number, dateLabel } from "@/lib/utils";
export function DenialsPage() {
  const { data: d, isPending, error, refetch } = useData("/analytics/denials");
  const [tab, setTab] = useState("Reasons");
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const k = d.kpis;
  return (
    <>
      <PageHeader
        eyebrow="ROOT CAUSE INTELLIGENCE"
        title="Understand the denial."
        description="Find the recurring issues behind denied claims and where to focus."
        exportKind="denials"
      />
      <div className="stats-grid four">
        <Stat
          label="Claims with denial history"
          value={number(k.denied_claims)}
          icon={FileX2}
        />
        <Stat
          label="Denial rate"
          value={k.denial_rate + "%"}
          footnote="Adjudicated claims denominator"
          icon={ChartNoAxesCombined}
        />
        <Stat
          label="Denied expected reimbursement"
          value={money(
            d.reasons.reduce((s: number, r: any) => s + r.amount, 0),
            true,
          )}
          footnote="Includes recovered denial history"
          icon={Wallet}
        />
        <Stat
          label="Distinct denial reasons"
          value={d.reasons.length}
          icon={Files}
        />
      </div>
      <Insight>
        <strong>Root cause spotlight</strong>
        <span>{d.insight}</span>
      </Insight>
      <div className="two-column">
        <Panel
          title="Denial Pareto analysis"
          description="Denied expected reimbursement and cumulative share"
        >
          {d.reasons.length ? <ParetoChart data={d.reasons} /> : <Empty />}
        </Panel>
        <Panel
          title="Denial distribution"
          description="By denied expected reimbursement"
        >
          <ReasonDonut data={d.reasons} total={k.denied_claims} />
        </Panel>
      </div>
      <Panel
        title="Denial rate over time"
        description="Weekly submission cohorts; recovered claims retain denial history"
      >
        <TrendChart data={d.trend} mode="denial" />
      </Panel>
      <div className="tabs" style={{ marginTop: 20 }}>
        {["Reasons", "Payers", "Providers", "Specialities"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "active" : ""}
          >
            {t}
          </button>
        ))}
      </div>
      <Panel
        title={tab + " breakdown"}
        description="Calculated from the selected submission cohort"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  {tab === "Reasons" ? "Denial reason" : tab.slice(0, -1)}
                </th>
                <th>
                  {tab === "Reasons" ? "Denied claims" : "Submitted claims"}
                </th>
                <th>
                  {tab === "Reasons"
                    ? "Denied expected reimbursement"
                    : "Denied claims"}
                </th>
                <th>{tab === "Reasons" ? "Share" : "Denial rate"}</th>
                {tab === "Reasons" && <th>Cumulative share</th>}
              </tr>
            </thead>
            <tbody>
              {(tab === "Reasons"
                ? d.reasons
                : tab === "Payers"
                  ? d.payers
                  : tab === "Providers"
                    ? d.providers
                    : d.specialties
              ).map((r: any, i: number) => (
                <tr key={i}>
                  <td>
                    <strong>{r.reason || r.payer || r.name}</strong>
                  </td>
                  <td>{number(r.count ?? r.total_claims ?? r.claims)}</td>
                  <td>
                    {tab === "Reasons"
                      ? money(r.amount)
                      : number(r.denied_claims ?? r.denied)}
                  </td>
                  <td>{Number(r.share ?? r.denial_rate).toFixed(1)}%</td>
                  {tab === "Reasons" && <td>{r.cumulative.toFixed(1)}%</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <MetricNote />
    </>
  );
}
export function RevenueRiskPage() {
  const {
    data: d,
    isPending,
    error,
    refetch,
  } = useData("/analytics/revenue-risk");
  const [tab, setTab] = useState("High priority");
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const k = d.kpis;
  const items =
    tab === "Over 90 days"
      ? d.claims.filter((r: any) => r.days_outstanding > 90)
      : tab === "Deadline approaching"
        ? d.claims.filter(
            (r: any) =>
              r.deadline_days !== null &&
              r.deadline_days >= 0 &&
              r.deadline_days <= 7,
          )
        : d.claims;
  return (
    <>
      <PageHeader
        eyebrow="REVENUE OPERATIONS"
        title="Put revenue risk in perspective."
        description="Track outstanding balances, ageing and time-sensitive follow-up."
        exportKind="revenue-risk"
      />
      <div className="stats-grid four">
        <Stat
          label="Net outstanding"
          value={money(k.outstanding, true)}
          icon={Hourglass}
        />
        <Stat
          label="Revenue at risk"
          value={money(k.revenue_at_risk, true)}
          accent
          icon={ShieldAlert}
        />
        <Stat
          label="Average days in A/R"
          value={k.avg_days_ar + " days"}
          icon={Clock3}
        />
        <Stat
          label="Recovered amount"
          value={money(k.recovered, true)}
          icon={BadgeDollarSign}
        />
      </div>
      <div className="risk-callout">
        <strong>How review exposure is defined.</strong> Revenue at risk
        includes outstanding balances on denied/appealed claims or claims aged
        more than 90 days. It represents a review queue, not a forecast or
        guaranteed loss. Balances include applicable patient responsibility.
      </div>
      <div className="two-column">
        <Panel
          title="Outstanding by age"
          description="Calendar days from submission, among positive balances"
        >
          <AgingChart data={d.aging} />
        </Panel>
        <Panel
          title="Ageing summary"
          description="Net balances after payments and adjustments"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ageing bucket</th>
                  <th>Claims</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {d.aging.map((r: any) => (
                  <tr key={r.bucket}>
                    <td>
                      <strong>{r.bucket} days</strong>
                    </td>
                    <td>{number(r.count)}</td>
                    <td>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <div className="two-column">
        <Panel
          title="Payer exposure"
          description="Outstanding balances by synthetic payer"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Payer</th>
                  <th>Outstanding</th>
                  <th>Reimbursement time</th>
                </tr>
              </thead>
              <tbody>
                {d.payers.map((r: any, i: number) => (
                  <tr key={r.payer_id}>
                    <td>
                      <div className="payer-cell">
                        <PayerMark name={r.payer} index={i} />
                        <strong>{r.payer}</strong>
                      </div>
                    </td>
                    <td>{money(r.outstanding, true)}</td>
                    <td>{r.avg_reimbursement_days ?? "—"} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Recovery trend"
          description="Recovered payments by claim submission cohort"
        >
          <TrendChart data={d.trend} mode="recovery" />
        </Panel>
      </div>
      <div className="tabs">
        {["High priority", "Over 90 days", "Deadline approaching"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <Panel
        title="Claims requiring review"
        description="Top 100 by rule-based priority; open a claim for the complete score"
      >
        <ClaimsTable items={items} priority />
      </Panel>
      <MetricNote />
    </>
  );
}
export function PrioritisationPage() {
  const [limit, setLimit] = useState(100),
    [level, setLevel] = useState(""),
    [search, setSearch] = useState("");
  const {
    data: d,
    isPending,
    error,
    refetch,
  } = useData("/analytics/worklist", { limit });
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const items = d.items.filter(
    (r: any) =>
      (!level || r.priority === level) &&
      (!search ||
        r.id.toLowerCase().includes(search.toLowerCase()) ||
        r.payer.toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <>
      <PageHeader
        eyebrow="INTELLIGENT WORKLIST"
        title="The right claim. The next action."
        description="Focus the team on explainable, high-impact follow-up priorities."
      />
      <div className="stats-grid four">
        {["Critical", "High", "Medium", "Low"].map((v) => (
          <Stat
            key={v}
            label={v + " priority"}
            value={number(d.items.filter((r: any) => r.priority === v).length)}
            footnote={`In the top ${limit} loaded claims`}
            icon={
              v === "Critical" ? ShieldAlert : v === "High" ? Clock3 : Files
            }
            accent={v === "Critical"}
          />
        ))}
      </div>
      <Insight>
        <strong>Transparent by design</strong>
        <span>
          Score = amount (25) + age (25) + denial (20) + deadline (20) +
          historical recovery (10). Open a claim to see the components and
          record a follow-up.
        </span>
      </Insight>
      <Panel
        title="Prioritised claims"
        description={`${number(d.total)} outstanding claims in this period · Showing up to ${limit}`}
        action={
          <select
            style={{ fontSize: 10, padding: 7 }}
            aria-label="Worklist limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[100, 250, 1000].map((n) => (
              <option value={n} key={n}>
                Top {n}
              </option>
            ))}
          </select>
        }
      >
        <div className="filter-toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search worklist"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search loaded claims or payer…"
            />
          </div>
          <select
            aria-label="Priority filter"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">All priorities</option>
            {["Critical", "High", "Medium", "Low"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Claim / payer</th>
                <th>Outstanding</th>
                <th>Priority / score</th>
                <th>Recommended next action</th>
                <th>Assigned to</th>
                <th>Recovery status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <Link href={"/claims/" + r.id} className="claim-link">
                      {r.id}
                    </Link>
                    <small>{r.payer}</small>
                  </td>
                  <td>
                    {money(r.outstanding)}
                    <small>{r.days_outstanding} days outstanding</small>
                  </td>
                  <td>
                    <Priority value={r.priority} />
                    <small>
                      Score {r.score}/100
                      {r.priority_override ? " · Manual override" : ""}
                    </small>
                  </td>
                  <td
                    style={{
                      whiteSpace: "normal",
                      maxWidth: 280,
                      lineHeight: 1.8,
                      fontSize: 9,
                    }}
                  >
                    {r.recommendation}
                  </td>
                  <td>{r.assigned_to || "Unassigned"}</td>
                  <td>
                    <Badge
                      tone={r.recovery_status === "Resolved" ? "teal" : "gray"}
                    >
                      {r.recovery_status}
                    </Badge>
                  </td>
                  <td>
                    <Button asChild variant="outline" size="sm">
                      <Link href={"/claims/" + r.id}>
                        Review <ArrowUpRight size={12} />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && <Empty />}
        <p className="analysis-table-footer">
          Historical recovery is descriptive and smoothed; it is not a validated
          recovery probability. Manual priorities are retained.
        </p>
      </Panel>
      <MetricNote />
    </>
  );
}
export function PayerPerformancePage() {
  const [provider, setProvider] = useState(""),
    [specialty, setSpecialty] = useState(""),
    [category, setCategory] = useState(""),
    [compare, setCompare] = useState<string[]>([]);
  const {
    data: d,
    isPending,
    error,
    refetch,
  } = useData("/analytics/payers", {
    provider_id: provider,
    specialty,
    category,
  });
  const { data: refs } = useQuery({
    queryKey: ["references"],
    queryFn: () => api("/references"),
  });
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const items = compare.length
    ? d.items.filter((p: any) => compare.includes(String(p.payer_id)))
    : d.items;
  return (
    <>
      <PageHeader
        eyebrow="PAYER INTELLIGENCE"
        title="A clearer payer perspective."
        description="Compare observed denial patterns, reimbursement and recovery performance."
        exportKind="payers"
      />
      <div
        className="filter-toolbar"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 20,
        }}
      >
        <Filter size={14} className="muted" />
        <select
          aria-label="Filter provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="">All providers</option>
          {refs?.providers.map((p: any) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter speciality"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
        >
          <option value="">All specialities</option>
          {refs?.providers.map((p: any) => (
            <option key={p.specialty}>{p.specialty}</option>
          ))}
        </select>
        <select
          aria-label="Filter category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {["Office visit", "Imaging", "Surgery", "Laboratory", "Therapy"].map(
            (v) => (
              <option key={v}>{v}</option>
            ),
          )}
        </select>
        <select
          aria-label="Add payer to comparison"
          value=""
          onChange={(e) => {
            if (e.target.value)
              setCompare((v) =>
                v.includes(e.target.value) ? v : [...v, e.target.value],
              );
          }}
        >
          <option value="">Compare payers…</option>
          {d.items.map((p: any) => (
            <option value={p.payer_id} key={p.payer_id}>
              {p.payer}
            </option>
          ))}
        </select>
        {compare.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setCompare([])}>
            Clear comparison ({compare.length})
          </Button>
        )}
      </div>
      <div className="scorecard-grid">
        {items.slice(0, 8).map((p: any, i: number) => (
          <div className="payer-scorecard" key={p.payer_id}>
            <div className="payer-scorecard-top">
              <PayerMark name={p.payer} index={i} />
              <div>
                <h3>{p.payer}</h3>
                <small>
                  {number(p.adjudicated_claims)} adjudicated outcomes
                </small>
              </div>
            </div>
            <div className="score">
              {p.score ?? "—"}
              <span>/100 score</span>
            </div>
            {!p.sufficient_data && (
              <Badge tone="amber">Insufficient sample (n&lt;30)</Badge>
            )}
            <div className="payer-scorecard-line">
              <span>Denial rate</span>
              <strong>{p.denial_rate.toFixed(1)}%</strong>
            </div>
            <div className="payer-scorecard-line">
              <span>Reimbursement time</span>
              <strong>{p.avg_reimbursement_days ?? "—"} days</strong>
            </div>
            <div className="payer-scorecard-line">
              <span>Outstanding</span>
              <strong>{money(p.outstanding, true)}</strong>
            </div>
            <div className="payer-scorecard-line">
              <span>Appeal success</span>
              <strong>
                {p.resolved_appeals
                  ? p.appeal_success_rate + "%"
                  : "No resolved appeals"}
              </strong>
            </div>
          </div>
        ))}
      </div>
      <p className="formula-note">
        <Info size={12} className="inline" /> {d.score_definition} This
        descriptive scorecard uses synthetic data and is not a payer quality
        rating.
      </p>
      <Panel
        title="Payer comparison"
        description="Submission cohort metrics, with consistent denominators"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Payer",
                  "Submitted",
                  "Denied",
                  "Denial rate",
                  "Average billed",
                  "Average paid",
                  "Outstanding",
                  "Appeal success",
                  "Recovery rate",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p: any) => (
                <tr key={p.payer_id}>
                  <td>
                    <strong>{p.payer}</strong>
                  </td>
                  <td>{number(p.total_claims)}</td>
                  <td>{number(p.denied_claims)}</td>
                  <td>{p.denial_rate.toFixed(1)}%</td>
                  <td>{money(p.avg_claim)}</td>
                  <td>{money(p.avg_paid)}</td>
                  <td>{money(p.outstanding, true)}</td>
                  <td>
                    {p.resolved_appeals ? p.appeal_success_rate + "%" : "—"}
                  </td>
                  <td>{p.recovery_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <MetricNote />
    </>
  );
}
export function UnderpaymentsPage() {
  const {
    data: d,
    isPending,
    error,
    refetch,
  } = useData("/analytics/underpayments");
  const [tab, setTab] = useState("Payer");
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <PageHeader
        eyebrow="PAYMENT INTEGRITY"
        title="Spot the reimbursement gap."
        description="Compare expected insurer reimbursement with recorded adjudicated payments."
        exportKind="underpayments"
      />
      <div className="stats-grid three">
        <Stat
          label="Potential underpayment"
          value={money(d.amount, true)}
          footnote="Under synthetic contract assumptions"
          icon={Coins}
          accent
        />
        <Stat label="Flagged claims" value={number(d.count)} icon={Files} />
        <Stat
          label="Average reimbursement gap"
          value={money(d.count ? d.amount / d.count : 0)}
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="risk-callout">
        <strong>Labelled synthetic assumptions.</strong> {d.basis} Potential
        underpayment = expected insurer reimbursement − actual payments. These
        alerts do not establish a contractual entitlement.
      </div>
      <div className="two-column">
        <Panel
          title="Underpayment trend"
          description="Potential reimbursement gaps by submission cohort"
        >
          <div className="chart-area">
            <SimpleUnderpaymentChart data={d.trend} />
          </div>
        </Panel>
        <Panel
          title={"Breakdown by " + tab.toLowerCase()}
          action={
            <div className="segmented">
              {["Payer", "Provider"].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "selected" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{tab}</th>
                  <th>Claims</th>
                  <th>Potential gap</th>
                </tr>
              </thead>
              <tbody>
                {(tab === "Payer" ? d.payers : d.providers).map((r: any) => (
                  <tr key={r[tab.toLowerCase()]}>
                    <td>
                      <strong>{r[tab.toLowerCase()]}</strong>
                    </td>
                    <td>{number(r.count)}</td>
                    <td>{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Panel
        title="High-value underpayment alerts"
        description="Top 100 reimbursement gaps under the synthetic assumption"
      >
        <ClaimsTable items={d.items} underpayment />
      </Panel>
      <MetricNote />
    </>
  );
}
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
function SimpleUnderpaymentChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ left: 0, right: 10, top: 15, bottom: 10 }}
      >
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => money(v, true)}
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip formatter={(v: any) => money(v)} />
        <Bar
          dataKey="underpayment"
          name="Potential underpayment"
          fill="#dbac68"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
