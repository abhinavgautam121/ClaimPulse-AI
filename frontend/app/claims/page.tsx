"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Download,
  Upload,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Files,
  Filter,
  X,
} from "lucide-react";
import {
  PageHeader,
  useData,
  Loading,
  ErrorState,
  Panel,
  Status,
  Empty,
  queryString,
  MetricNote,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { ClaimForm } from "@/components/claim-form";
import { usePeriod } from "@/components/providers";
import { api, download } from "@/services/api";
import { dateLabel, money, number } from "@/lib/utils";
export default function Claims() {
  const { period } = usePeriod();
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [payer, setPayer] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [sort, setSort] = useState("submission_date"),
    [direction, setDirection] = useState("desc"),
    [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [more, setMore] = useState(false),
    [create, setCreate] = useState(false);
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search).get("q") || "");
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [payer, status, period, min, max, pageSize]);
  const filters = {
    q,
    payer_id: payer,
    status,
    page,
    page_size: pageSize,
    sort,
    direction,
    min_amount: min,
    max_amount: max,
  };
  const { data, isPending, error, refetch } = useData("/claims", filters);
  const { data: refs } = useQuery({
    queryKey: ["references"],
    queryFn: () => api("/references"),
  });
  const changeSort = (s: string) => {
    setSort(s);
    setDirection(sort === s && direction === "desc" ? "asc" : "desc");
  };
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  return (
    <>
      <PageHeader
        eyebrow="CLAIMS OPERATIONS"
        title="Claims management"
        description="Every claim, its status and the details behind the balance."
      >
        <Button variant="outline" asChild>
          <Link href="/data-ingestion">
            <Upload size={14} />
            Import CSV
          </Link>
        </Button>
        <Button onClick={() => setCreate(true)}>
          <Plus size={15} />
          Create claim
        </Button>
      </PageHeader>
      <Panel
        title="All claims"
        description={
          data
            ? `${number(data.total)} claims match your filters`
            : "Loading claims…"
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              download(
                "/exports/claims?" + queryString({ ...period, ...filters }),
                "claimpulse-filtered-claims.csv",
              )
            }
          >
            <Download size={14} />
            Export CSV
          </Button>
        }
      >
        <div className="filter-toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search claims"
              placeholder="Search claim or patient reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter payer"
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
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {refs?.statuses.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMore((v) => !v)}
          >
            <Filter size={13} />
            Amount
          </Button>
          {more && (
            <>
              <input
                aria-label="Minimum amount"
                type="number"
                min="0"
                placeholder="Min amount"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
              <input
                aria-label="Maximum amount"
                type="number"
                min="0"
                placeholder="Max amount"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </>
          )}
          {(payer || status || q || min || max) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setPayer("");
                setStatus("");
                setMin("");
                setMax("");
              }}
            >
              <X size={12} />
              Clear
            </Button>
          )}
        </div>
        {isPending ? (
          <div className="panel-body">
            <Loading />
          </div>
        ) : error ? (
          <ErrorState error={error} retry={refetch} />
        ) : !data.items.length ? (
          <Empty>
            <Button variant="outline" onClick={() => setCreate(true)}>
              <Plus size={14} />
              Create a synthetic claim
            </Button>
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    ["id", "Claim ID / patient"],
                    ["payer", "Payer / provider"],
                    ["submission_date", "Submitted"],
                    ["amount", "Billed amount"],
                    ["outstanding", "Outstanding"],
                    ["status", "Status"],
                  ].map(([key, label]) => (
                    <th key={key}>
                      {key === "payer" ? (
                        label
                      ) : (
                        <button
                          className="table-column-button"
                          onClick={() => changeSort(key)}
                        >
                          {label}
                          <ArrowUpDown size={10} />
                        </button>
                      )}
                    </th>
                  ))}
                  <th>Age</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={"/claims/" + c.id} className="claim-link">
                        {c.id}
                      </Link>
                      <small>{c.patient_id}</small>
                    </td>
                    <td>
                      <strong>{c.payer}</strong>
                      <small>{c.provider}</small>
                    </td>
                    <td>{dateLabel(c.submission_date)}</td>
                    <td>{money(c.amount)}</td>
                    <td className="font-medium">{money(c.outstanding)}</td>
                    <td>
                      <Status status={c.status} />
                    </td>
                    <td>
                      <span
                        className={c.days_outstanding > 90 ? "text-amber" : ""}
                      >
                        {c.days_outstanding ? c.days_outstanding + "d" : "—"}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={"/claims/" + c.id}
                        className="icon-button"
                        aria-label={"View " + c.id}
                      >
                        <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-pagination">
          <span>
            {data?.total
              ? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, data.total))} of ${number(data.total)} claims`
              : "0 claims"}
          </span>
          <div>
            <span>Rows per page</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <Button
              aria-label="Previous page"
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((v) => v - 1)}
            >
              <ChevronLeft size={13} />
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button
              aria-label="Next page"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((v) => v + 1)}
            >
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      </Panel>
      <MetricNote />
      <ClaimForm open={create} onOpenChange={setCreate} />
    </>
  );
}
