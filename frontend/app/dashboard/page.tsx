"use client";
import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Files,
  FileX2,
  ChartNoAxesCombined,
  Wallet,
  Hourglass,
  ShieldAlert,
  BadgeDollarSign,
  Clock3,
  ArrowUpRight,
  ArrowRight,
  Download,
  RefreshCw,
  Sparkles,
  ChevronRight,
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
  ReasonDonut,
  PayerMark,
  ClaimsTable,
  MetricNote,
  Empty,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { usePeriod } from "@/components/providers";
import { download } from "@/services/api";
import { money, number } from "@/lib/utils";
import { queryString } from "@/components/common";
export default function Dashboard() {
  const { data, isPending, error, refetch, dataUpdatedAt } = useData(
    "/analytics/dashboard",
  );
  const { period } = usePeriod();
  const [mode, setMode] = useState<"revenue" | "claims" | "denial">("revenue");
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const k = data.kpis;
  const c = data.changes;
  const top = data.reasons[0];
  return (
    <>
      <PageHeader
        eyebrow="EXECUTIVE OVERVIEW"
        title="Revenue, in focus."
        description="A clearer picture of your claims, denials and revenue recovery."
      >
        <Button
          onClick={() =>
            download(
              "/exports/claims?" + queryString(period),
              "claimpulse-executive-claims.csv",
            )
          }
        >
          <Download size={15} />
          Export report
        </Button>
      </PageHeader>
      <div className="overview-meta">
        <span className="badge teal">
          <span className="tiny-dot" />
          Synthetic workspace
        </span>
        <span>
          {data.providers.length} providers <span className="meta-dot">·</span>{" "}
          {data.payers.length} payers
        </span>
        <span className="updated-time">
          <RefreshCw size={12} />
          Updated{" "}
          {new Date(dataUpdatedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
          <button
            aria-label="Refresh dashboard"
            className="inline-icon"
            onClick={() => refetch()}
          >
            <RefreshCw size={12} />
          </button>
        </span>
      </div>
      <div className="stats-grid four">
        <Stat
          label="Claims submitted"
          value={number(k.total_claims)}
          change={c.total_claims}
          icon={Files}
        />
        <Stat
          label="Claims denied"
          value={number(k.denied_claims)}
          change={c.denied_claims}
          inverse
          icon={FileX2}
        />
        <Stat
          label="Denial rate"
          value={
            <>
              {k.denial_rate.toFixed(2)}
              <span className="value-unit">%</span>
            </>
          }
          footnote={`${number(k.adjudicated_claims)} adjudicated claims`}
          icon={ChartNoAxesCombined}
        />
        <Stat
          label="Total billed"
          value={money(k.billed, true)}
          change={c.billed}
          icon={Wallet}
        />
      </div>
      <div className="stats-grid four secondary-stats">
        <Stat
          label="Net outstanding"
          value={money(k.outstanding, true)}
          change={c.outstanding}
          inverse
          icon={Hourglass}
        />
        <Stat
          label="Revenue at risk"
          value={money(k.revenue_at_risk, true)}
          footnote="Flagged balances for review"
          icon={ShieldAlert}
          accent
        />
        <Stat
          label="Recovered amount"
          value={money(k.recovered, true)}
          change={c.recovered}
          icon={BadgeDollarSign}
        />
        <Stat
          label="Average days in A/R"
          value={
            <>
              {k.avg_days_ar}
              <span className="value-unit">days</span>
            </>
          }
          change={c.avg_days_ar}
          inverse
          icon={Clock3}
        />
      </div>
      {top && (
        <Insight>
          <strong>Your next opportunity</strong>
          <span>
            {top.reason} drives <b>{top.share.toFixed(1)}%</b> of denied
            expected reimbursement. Review the root causes to focus your
            follow-up.
          </span>
          <Link href="/denials">
            Explore denials <ArrowRight size={15} />
          </Link>
        </Insight>
      )}
      <div className="dashboard-charts">
        <Panel
          title={
            mode === "revenue"
              ? "Revenue performance"
              : mode === "claims"
                ? "Claims performance"
                : "Denial rate trend"
          }
          description={
            mode === "revenue"
              ? "Billed charges and recorded payments by submission cohort"
              : "Weekly trends across the selected period"
          }
          action={
            <div className="segmented">
              {(["revenue", "claims", "denial"] as const).map((m) => (
                <button
                  className={mode === m ? "selected" : ""}
                  key={m}
                  onClick={() => setMode(m)}
                >
                  {m === "revenue"
                    ? "Revenue"
                    : m === "claims"
                      ? "Claims"
                      : "Denial rate"}
                </button>
              ))}
            </div>
          }
        >
          <div className="chart-summary">
            <strong>
              {mode === "revenue"
                ? money(k.billed, true)
                : mode === "claims"
                  ? number(k.total_claims)
                  : k.denial_rate + "%"}
              <span>
                {mode === "revenue"
                  ? "total billed"
                  : mode === "claims"
                    ? "submitted claims"
                    : "observed denial rate"}
              </span>
            </strong>
            <div className="chart-legend">
              <span>
                <i className="blue-dot" />
                {mode === "revenue"
                  ? "Billed charges"
                  : mode === "claims"
                    ? "Submitted"
                    : "Denial rate"}
              </span>
              {mode !== "denial" && (
                <span>
                  <i className="teal-dot" />
                  {mode === "revenue" ? "Payments" : "Denied"}
                </span>
              )}
            </div>
          </div>
          {data.trend.length ? (
            <TrendChart data={data.trend} mode={mode} />
          ) : (
            <Empty />
          )}
        </Panel>
        <Panel
          title="Why claims are denied"
          description="Share of denied expected reimbursement"
          action={
            <Link
              href="/denials"
              className="icon-button"
              aria-label="View denial analysis"
            >
              <ArrowUpRight size={17} />
            </Link>
          }
        >
          {data.reasons.length ? (
            <ReasonDonut data={data.reasons} total={k.denied_claims} />
          ) : (
            <Empty title="No denied claims" />
          )}
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel
          title="Payer performance"
          description="Where your outstanding balances stand"
          action={
            <Link href="/payer-performance" className="text-link">
              View all <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="table-scroll">
            <table className="payer-table">
              <thead>
                <tr>
                  <th>Payer</th>
                  <th>Denial rate</th>
                  <th>Outstanding</th>
                  <th>Claims</th>
                </tr>
              </thead>
              <tbody>
                {data.payers.slice(0, 5).map((p: any, i: number) => (
                  <tr key={p.payer_id}>
                    <td>
                      <div className="payer-cell">
                        <PayerMark name={p.payer} index={i} />
                        <strong>{p.payer}</strong>
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          p.denial_rate > 15 ? "rate-warning" : "rate-neutral"
                        }
                      >
                        {p.denial_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td>{money(p.outstanding, true)}</td>
                    <td>{number(p.total_claims)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Needs your attention"
          description="Highest priority claims in your worklist"
          action={
            <Link href="/claim-prioritisation" className="text-link">
              Open worklist <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="attention-list">
            {data.priority.length ? (
              data.priority.slice(0, 4).map((r: any) => (
                <Link
                  href={"/claims/" + r.id}
                  key={r.id}
                  className="attention-item"
                >
                  <span className="attention-icon">
                    <ShieldAlert size={17} />
                  </span>
                  <div>
                    <strong>
                      {r.id}
                      <span>{money(r.outstanding)}</span>
                    </strong>
                    <p>{r.denial_reason || r.payer}</p>
                    <small>
                      {r.deadline_days !== null && r.deadline_days >= 0
                        ? `Appeal due in ${r.deadline_days} days`
                        : `${r.days_outstanding} days outstanding`}
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))
            ) : (
              <Empty title="No outstanding claims" />
            )}
          </div>
        </Panel>
      </div>
      <div className="copilot-strip">
        <span className="copilot-mark">
          <Sparkles size={21} />
        </span>
        <div>
          <strong>Let your data answer the next question.</strong>
          <p>
            Ask ClaimPulse Copilot about denial patterns, ageing claims or
            revenue at risk.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/copilot">
            Ask Copilot <ArrowUpRight size={15} />
          </Link>
        </Button>
      </div>
      <MetricNote />
    </>
  );
}
