"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Info,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Clock3,
  ShieldCheck,
  AlertCircle,
  Inbox,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
  ComposedChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { usePeriod } from "@/components/providers";
import { money, number, periodFor, dateLabel } from "@/lib/utils";
import { api, download } from "@/services/api";
export const COLORS = [
  "#2272e8",
  "#13a898",
  "#92b6ee",
  "#fac277",
  "#c3d4ed",
  "#92c9b8",
  "#c2b4db",
  "#a7b0c0",
  "#edb8a8",
];
export const queryString = (obj: Record<string, unknown>) =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ),
  ).toString();
export function useData(path: string, extra: Record<string, unknown> = {}) {
  const { period } = usePeriod();
  const qs = queryString({ ...period, ...extra });
  return useQuery({
    queryKey: [path, qs],
    queryFn: () => api(path + "?" + qs),
  });
}
export function DateFilter() {
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(period);
  const [custom, setCustom] = useState(false);
  const days =
    Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000) +
    1;
  return (
    <div className="date-filter">
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        <CalendarDays size={15} />
        <span>
          {period.end === periodFor(1).end && [1, 7, 30, 90].includes(days)
            ? days === 1
              ? "Today"
              : `Last ${days} days`
            : `${dateLabel(period.start)} – ${dateLabel(period.end)}`}
        </span>
        <ChevronDown size={14} />
      </Button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="date-menu floating-panel">
            {[1, 7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => {
                  setPeriod(periodFor(d));
                  setOpen(false);
                }}
              >
                {d === 1 ? "Today" : `Last ${d} days`}
                {days === d && <Check size={14} />}
              </button>
            ))}
            <button
              onClick={() => {
                setCustom((v) => !v);
                setDraft(period);
              }}
            >
              Custom range <CalendarDays size={14} />
            </button>
            {custom && (
              <div className="custom-dates">
                <label>
                  Start date
                  <input
                    type="date"
                    value={draft.start}
                    onChange={(e) =>
                      setDraft({ ...draft, start: e.target.value })
                    }
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={draft.end}
                    onChange={(e) =>
                      setDraft({ ...draft, end: e.target.value })
                    }
                  />
                </label>
                <Button
                  size="sm"
                  disabled={!draft.start || draft.start > draft.end}
                  onClick={() => {
                    setPeriod(draft);
                    setOpen(false);
                  }}
                >
                  Apply range
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  exportKind,
  date = true,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
  exportKind?: string;
  date?: boolean;
}) {
  const { period } = usePeriod();
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-header-actions">
        {date && <DateFilter />}
        {exportKind && (
          <Button
            variant="outline"
            onClick={() =>
              download(
                "/exports/" + exportKind + "?" + queryString(period),
                "claimpulse-" + exportKind + ".csv",
              )
            }
          >
            <Download size={15} />
            Export
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Status({ status }: { status: string }) {
  return (
    <span
      className={"status status-" + status.toLowerCase().replaceAll(" ", "-")}
    >
      <i />
      {status}
    </span>
  );
}
export function Priority({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === "Critical"
          ? "red"
          : value === "High"
            ? "amber"
            : value === "Medium"
              ? "blue"
              : "gray"
      }
    >
      <span className="priority-bars">
        {value === "Critical"
          ? "▮▮▮"
          : value === "High"
            ? "▮▮"
            : value === "Medium"
              ? "▮"
              : "·"}
      </span>
      {value}
    </Badge>
  );
}
export function Stat({
  label,
  value,
  change,
  footnote,
  icon: Icon,
  accent = false,
  inverse = false,
}: {
  label: string;
  value: React.ReactNode;
  change?: number | null;
  footnote?: string;
  icon?: any;
  accent?: boolean;
  inverse?: boolean;
}) {
  const good =
    change !== null &&
    change !== undefined &&
    (inverse ? change <= 0 : change >= 0);
  return (
    <div className={"stat-card " + (accent ? "accent" : "")}>
      <div className="stat-label">
        {label}
        {Icon && <Icon size={16} />}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-context">
        {change !== undefined && change !== null ? (
          <>
            <span className={"stat-change " + (good ? "positive" : "negative")}>
              {change >= 0 ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownRight size={13} />
              )}{" "}
              {Math.abs(change).toFixed(1)}%
            </span>
            <span>vs previous period</span>
          </>
        ) : (
          <span>{footnote || "Selected submission cohort"}</span>
        )}
      </div>
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Loading() {
  return (
    <div className="loading-state">
      <div className="skeleton-row">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton-card" key={i} />
        ))}
      </div>
      <div className="skeleton-chart" />
      <div className="skeleton-chart short" />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => unknown;
}) {
  return (
    <div className="state-card">
      <AlertCircle size={28} />
      <h3>We couldn’t load this view.</h3>
      <p>
        {(error as Error)?.message || "Check the connection and try again."}
      </p>
      <Button variant="outline" onClick={retry}>
        <RefreshCw size={15} />
        Try again
      </Button>
    </div>
  );
}
export function Empty({
  title = "No records in this view",
  description = "Adjust the filters or import synthetic claims to get started.",
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Insight({
  children,
  tone = "teal",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className={"insight-banner " + tone}>
      <span className="insight-icon">
        <SparkleIcon />
      </span>
      <div>{children}</div>
    </div>
  );
}
function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z"
        fill="currentColor"
      />
    </svg>
  );
}
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label || payload[0]?.name}</strong>
      {payload.map((p, i) => (
        <p key={i}>
          <i style={{ background: p.color || p.fill }} />
          {p.name}
          <b>
            {p.dataKey === "denial_rate"
              ? number(p.value) + "%"
              : p.dataKey === "total_claims" || p.dataKey === "denied_claims"
                ? number(p.value)
                : money(p.value)}
          </b>
        </p>
      ))}
    </div>
  );
}
export function TrendChart({
  data,
  mode = "revenue",
}: {
  data: any[];
  mode?: "revenue" | "claims" | "denial" | "recovery";
}) {
  const a =
    mode === "claims"
      ? "total_claims"
      : mode === "denial"
        ? "denial_rate"
        : mode === "recovery"
          ? "recovered"
          : "billed";
  const b = mode === "claims" ? "denied_claims" : "paid";
  const label =
    mode === "claims"
      ? "Submitted"
      : mode === "denial"
        ? "Denial rate"
        : mode === "recovery"
          ? "Recovered"
          : "Billed charges";
  return (
    <div className="chart-area">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 15, right: 8, left: -12, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id={"blue-fill-" + mode}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#2272e8" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#2272e8" stopOpacity={0.005} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--grid)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#8992a4" }}
            minTickGap={27}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#8992a4" }}
            tickFormatter={(v) =>
              mode === "claims"
                ? number(v)
                : mode === "denial"
                  ? v + "%"
                  : money(v, true)
            }
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey={a}
            name={label}
            stroke="#2272e8"
            fill={`url(#blue-fill-${mode})`}
            strokeWidth={2.5}
            activeDot={{ r: 5, strokeWidth: 3, stroke: "#fff" }}
          />
          {["revenue", "claims"].includes(mode) && (
            <Area
              type="monotone"
              dataKey={b}
              name={mode === "claims" ? "Denied" : "Payments"}
              stroke="#16a394"
              fill="transparent"
              strokeWidth={2.2}
              activeDot={{ r: 5 }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function AgingChart({ data }: { data: any[] }) {
  return (
    <div className="chart-area">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 15, left: -5, right: 10, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--grid)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 12, fill: "#8992a4" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => money(v, true)}
            tick={{ fontSize: 11, fill: "#8992a4" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          <Bar
            dataKey="amount"
            name="Outstanding"
            radius={[5, 5, 0, 0]}
            maxBarSize={58}
          >
            {data.map((d, i) => (
              <Cell
                key={d.bucket}
                fill={i > 2 ? "#ebad66" : i === 2 ? "#8aabe3" : "#3379da"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ReasonDonut({ data, total }: { data: any[]; total: number }) {
  return (
    <div className="donut-layout">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="reason"
              innerRadius={67}
              outerRadius={87}
              paddingAngle={3}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((d, i) => (
                <Cell key={d.reason} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => money(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{number(total)}</strong>
          <span>denied claims</span>
        </div>
      </div>
      <div className="donut-legend">
        {data.slice(0, 4).map((d, i) => (
          <div key={d.reason}>
            <span>
              <i style={{ background: COLORS[i] }} />
              {d.reason}
            </span>
            <strong>{Number(d.share).toFixed(1)}%</strong>
          </div>
        ))}
        {data.length > 4 && (
          <div>
            <span>
              <i style={{ background: "#a7b0c0" }} />
              Other reasons
            </span>
            <strong>
              {(
                100 - data.slice(0, 4).reduce((s, d) => s + d.share, 0)
              ).toFixed(1)}
              %
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}
export function ParetoChart({ data }: { data: any[] }) {
  return (
    <div className="chart-area tall">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 15, right: 0, left: 0, bottom: 60 }}
        >
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="reason"
            angle={-22}
            textAnchor="end"
            tick={{ fontSize: 10, fill: "#8992a4" }}
            interval={0}
            tickLine={false}
          />
          <YAxis
            yAxisId="amount"
            tickFormatter={(v) => money(v, true)}
            tick={{ fontSize: 11 }}
            axisLine={false}
          />
          <YAxis
            yAxisId="percent"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v) => v + "%"}
            tick={{ fontSize: 11 }}
            axisLine={false}
          />
          <Tooltip />
          <Bar
            yAxisId="amount"
            dataKey="amount"
            name="Denied expected reimbursement"
            fill="#3379da"
            radius={[4, 4, 0, 0]}
            maxBarSize={45}
          />
          <Line
            yAxisId="percent"
            type="monotone"
            dataKey="cumulative"
            name="Cumulative %"
            stroke="#13a898"
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
export function PayerMark({
  name,
  index = 0,
}: {
  name: string;
  index?: number;
}) {
  return (
    <span className={"payer-mark payer-" + (index % 5)}>
      {name
        .split(" ")
        .map((v) => v[0])
        .join("")
        .slice(0, 2)}
    </span>
  );
}
export function ClaimsTable({
  items,
  priority = false,
  underpayment = false,
}: {
  items: any[];
  priority?: boolean;
  underpayment?: boolean;
}) {
  return items.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Claim / payer</th>
            <th>{underpayment ? "Expected reimbursement" : "Claim amount"}</th>
            <th>{underpayment ? "Potential underpayment" : "Outstanding"}</th>
            <th>{priority ? "Priority" : "Status"}</th>
            <th>{priority ? "Score" : "Submitted"}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((c: any) => (
            <tr key={c.id}>
              <td>
                <Link className="claim-link" href={"/claims/" + c.id}>
                  {c.id}
                </Link>
                <small>{c.payer}</small>
              </td>
              <td>
                {money(underpayment ? c.expected_reimbursement : c.amount)}
              </td>
              <td className={underpayment ? "text-amber" : "font-medium"}>
                {money(underpayment ? c.underpayment : c.outstanding)}
              </td>
              <td>
                {priority ? (
                  <Priority value={c.priority} />
                ) : (
                  <Status status={c.status} />
                )}
              </td>
              <td>
                {priority ? (
                  <div className="score-inline">
                    <div>
                      <i style={{ width: c.score + "%" }} />
                    </div>
                    <span>{c.score}</span>
                  </div>
                ) : (
                  dateLabel(c.submission_date)
                )}
              </td>
              <td>
                <Link
                  href={"/claims/" + c.id}
                  className="icon-button"
                  aria-label={"View " + c.id}
                >
                  <ArrowUpRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
export function MetricNote() {
  return (
    <div className="metric-note">
      <Info size={14} />
      <p>
        USD · Submission date cohort · Synthetic data.{" "}
        <Link href="/reports">
          View metric definitions <ArrowUpRight size={12} />
        </Link>
      </p>
    </div>
  );
}
