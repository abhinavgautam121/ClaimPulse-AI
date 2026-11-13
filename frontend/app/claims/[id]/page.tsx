"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  Check,
  LoaderCircle,
  Send,
  ShieldCheck,
  Clock3,
  Info,
} from "lucide-react";
import { api, post } from "@/services/api";
import {
  PageHeader,
  Panel,
  Loading,
  ErrorState,
  Status,
  Priority,
  Badge,
  Empty,
  MetricNote,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { money, dateLabel } from "@/lib/utils";
export default function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const {
    data: c,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["claim", id],
    queryFn: () => api("/claims/" + encodeURIComponent(id)),
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/auth/users"),
  });
  const { data: refs } = useQuery({
    queryKey: ["references"],
    queryFn: () => api("/references"),
  });
  const [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [nextStatus, setNextStatus] = useState(""),
    [paid, setPaid] = useState(""),
    [adjustment, setAdjustment] = useState(""),
    [reason, setReason] = useState(""),
    [deadline, setDeadline] = useState(""),
    [assignee, setAssignee] = useState(""),
    [priority, setPriority] = useState(""),
    [recovery, setRecovery] = useState("Open"),
    [action, setAction] = useState(""),
    [errorText, setErrorText] = useState(""),
    [flags, setFlags] = useState({
      authorized: true,
      documentation_complete: true,
      eligibility_verified: true,
    }),
    [draftAmount, setDraftAmount] = useState("");
  useEffect(() => {
    if (c) {
      setAssignee(String(c.assignment?.user_id || ""));
      setPriority(c.assignment?.priority || "");
      setRecovery(c.assignment?.recovery_status || "Open");
      setPaid(String(c.paid_amount));
      setAdjustment(String(c.adjustment));
      setReason(c.denial_reason || "");
      setDeadline(c.appeal_deadline || "");
      setFlags({
        authorized: c.authorized,
        documentation_complete: c.documentation_complete,
        eligibility_verified: c.eligibility_verified,
      });
      setDraftAmount(String(c.amount));
    }
  }, [c]);
  const save = async (data: unknown) => {
    setBusy(true);
    setErrorText("");
    try {
      await api("/claims/" + id, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      qc.invalidateQueries();
      toast.success("Claim updated.");
      setEdit(false);
      setNextStatus("");
    } catch (e) {
      setErrorText((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <Link href="/claims" className="back-link">
        <ArrowLeft size={13} />
        Back to claims
      </Link>
      <PageHeader
        eyebrow="CLAIM DETAILS"
        title={c.id}
        description={`${c.payer} · ${c.provider}`}
        date={false}
      >
        <Button
          variant="outline"
          disabled={!["Draft", "Submitted", "Processing"].includes(c.status)}
          title={
            !["Draft", "Submitted", "Processing"].includes(c.status)
              ? "Submission inputs are locked after adjudication; use notes for follow-up corrections."
              : "Edit submission inputs"
          }
          onClick={() => {
            setErrorText("");
            setEdit(true);
          }}
        >
          <Pencil size={14} />
          Edit claim
        </Button>
      </PageHeader>
      <div
        className="detail-status-row"
        style={{ marginTop: -8, marginBottom: 22 }}
      >
        <Status status={c.status} />
        <Badge tone="teal">
          <ShieldCheck size={11} />
          Synthetic record
        </Badge>
        <Badge>{c.source}</Badge>
        <span className="muted" style={{ fontSize: 9 }}>
          Updated {dateLabel(c.updated_at)}
        </span>
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <Panel
            title="Claim overview"
            description="Reference details and submission information"
          >
            <dl className="detail-data-grid">
              {[
                ["Patient reference", c.patient_id],
                ["Provider", c.provider],
                ["Payer", c.payer],
                ["Speciality", c.specialty],
                ["Submission date", dateLabel(c.submission_date)],
                ["Service date", dateLabel(c.service_date)],
                ["Procedure category", c.procedure_category],
                ["Diagnosis category", c.diagnosis_category],
                ["Denial reason", c.denial_reason || "None recorded"],
                ["Appeal deadline", dateLabel(c.appeal_deadline)],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <div className="check-grid">
                {[
                  ["Authorisation", c.authorized],
                  ["Documentation", c.documentation_complete],
                  ["Eligibility", c.eligibility_verified],
                ].map(([key, v]) => (
                  <Badge key={String(key)} tone={v ? "teal" : "amber"}>
                    {v ? <Check size={11} /> : <Info size={11} />} {key}:{" "}
                    {v ? "verified" : "review needed"}
                  </Badge>
                ))}
              </div>
            </div>
          </Panel>
          <Panel
            title="Activity & follow-up history"
            description="Changes recorded for this claim"
          >
            <div className="timeline">
              {c.events.slice(0, 20).map((e: any) => (
                <div className="timeline-item" key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{e.message}</strong>
                    <p>
                      {dateLabel(e.created_at)} · {e.source}
                    </p>
                  </div>
                </div>
              ))}
              {c.actions.map((a: any) => (
                <div className="timeline-item" key={"a" + a.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{a.action}</strong>
                    <p>{dateLabel(a.created_at)} · Follow-up action</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            title="Team notes"
            description="Keep the context behind every action"
          >
            {c.notes.length ? (
              <div className="note-list">
                {c.notes.map((n: any) => (
                  <div key={n.id} className="note-item">
                    <p>{n.text}</p>
                    <small>
                      {users.find((u: any) => u.id === n.user_id)?.name ||
                        "Team member"}{" "}
                      · {dateLabel(n.created_at)}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">
                No notes yet. Add context for your team.
              </p>
            )}
            <form
              className="note-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                try {
                  await post("/claims/" + id + "/notes", { text: note });
                  setNote("");
                  qc.invalidateQueries();
                  toast.success("Note added.");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <textarea
                aria-label="Team note"
                placeholder="Add a note using synthetic information only…"
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button type="submit" disabled={!note.trim()} size="sm">
                <Send size={13} />
                Add note
              </Button>
            </form>
          </Panel>
          {c.payments.length > 0 && (
            <Panel
              title="Payment ledger"
              description="Payments reconciled to this claim"
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Payment date</th>
                      <th>Amount</th>
                      <th>Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{dateLabel(p.payment_date)}</td>
                        <td>{money(p.amount)}</td>
                        <td>
                          {p.recovered ? (
                            <Badge tone="teal">Recovered</Badge>
                          ) : (
                            "Standard payment"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
        <aside className="detail-aside">
          <Panel title="Financial summary">
            <div className="financial-lines">
              {[
                ["Billed charges", c.amount],
                ["Expected insurer reimbursement", c.expected_reimbursement],
                ["Payments received", c.paid_amount],
                ["Contractual adjustments", c.adjustment],
                ["Patient responsibility", c.patient_responsibility],
              ].map(([key, v]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{money(v)}</strong>
                </div>
              ))}
              <div className="total">
                <span>Net outstanding</span>
                <strong>{money(c.outstanding)}</strong>
              </div>
            </div>
            <div className="recommendation">
              {c.expected_basis}. Net outstanding includes patient balances
              where present.
            </div>
          </Panel>
          <Panel
            title="Review priority"
            description="Explainable rule-based score"
          >
            <div className="risk-score">
              <strong>
                {c.risk.score}
                <span className="value-unit">/100</span>
              </strong>
              <div>
                <Priority value={c.assignment?.priority || c.risk.priority} />
                <span>{c.days_outstanding} days outstanding</span>
              </div>
            </div>
            <div className="risk-components">
              {Object.entries(c.risk.components).map(([key, v]) => (
                <div key={key}>
                  <span>{key}</span>
                  <div className="component-track">
                    <i style={{ width: (Number(v) / 25) * 100 + "%" }} />
                  </div>
                  <strong>{String(v)}</strong>
                </div>
              ))}
            </div>
            <div className="recommendation">
              {c.risk.recommendation}
              <p style={{ marginTop: 8, fontSize: 9 }}>
                A prioritisation score, not a guaranteed probability of loss or
                recovery.
              </p>
            </div>
          </Panel>
          <Panel title="Worklist assignment">
            <form
              className="settings-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/claims/" + id + "/assignment", {
                    method: "PUT",
                    body: JSON.stringify({
                      user_id: assignee ? Number(assignee) : null,
                      priority: priority || null,
                      recovery_status: recovery,
                      action,
                    }),
                  });
                  setAction("");
                  qc.invalidateQueries();
                  toast.success("Worklist updated.");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <label>
                Assigned to
                <select
                  aria-label="Assigned to"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Priority
                  <select
                    aria-label="Priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="">Automatic</option>
                    {["Critical", "High", "Medium", "Low"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Recovery status
                  <select
                    aria-label="Recovery status"
                    value={recovery}
                    onChange={(e) => setRecovery(e.target.value)}
                  >
                    {["Open", "In review", "Waiting on payer", "Resolved"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <label>
                Follow-up action
                <textarea
                  placeholder="Record a follow-up action…"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <Button type="submit" size="sm">
                Save follow-up
              </Button>
            </form>
          </Panel>
          {c.transitions.length > 0 && (
            <Panel
              title="Update claim status"
              description="Only valid next statuses are available"
            >
              <form
                className="settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data: any = {
                    status: nextStatus,
                    paid_amount: paid,
                    adjustment,
                  };
                  if (["Denied", "Appealed"].includes(nextStatus))
                    data.denial_reason = reason || c.denial_reason;
                  if (deadline) data.appeal_deadline = deadline;
                  save(data);
                }}
              >
                <label>
                  Next status
                  <select
                    aria-label="Next status"
                    value={nextStatus}
                    required
                    onChange={(e) => {
                      setNextStatus(e.target.value);
                      if (["Paid", "Recovered"].includes(e.target.value))
                        setPaid(
                          (Number(c.amount) - Number(adjustment)).toFixed(2),
                        );
                      if (e.target.value === "Closed")
                        setAdjustment(
                          (Number(c.amount) - Number(paid)).toFixed(2),
                        );
                    }}
                  >
                    <option value="">Choose next status</option>
                    {c.transitions.map((s: string) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {nextStatus && (
                  <>
                    <label>
                      Total payments received ($)
                      <input
                        type="number"
                        value={paid}
                        min={c.paid_amount}
                        step="0.01"
                        onChange={(e) => setPaid(e.target.value)}
                      />
                    </label>
                    <label>
                      Applicable adjustments ($)
                      <input
                        type="number"
                        value={adjustment}
                        min="0"
                        step="0.01"
                        onChange={(e) => setAdjustment(e.target.value)}
                      />
                    </label>
                    {["Denied", "Appealed"].includes(nextStatus) && (
                      <>
                        <label>
                          Denial reason
                          <select
                            required
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          >
                            <option value="">Select reason</option>
                            {refs?.reasons.map((r: string) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Appeal deadline
                          <input
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <Button disabled={busy} type="submit" size="sm">
                      {busy ? (
                        <LoaderCircle size={13} className="spin" />
                      ) : (
                        <ArrowRight size={13} />
                      )}
                      Update status
                    </Button>
                  </>
                )}
                {errorText && (
                  <p className="field-error" role="alert">
                    {errorText}
                  </p>
                )}
              </form>
            </Panel>
          )}
        </aside>
      </div>
      <MetricNote />
      <Modal
        open={edit}
        onOpenChange={setEdit}
        title="Edit claim"
        description="Update review information. Billed charges can be changed for drafts."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save({
              ...flags,
              ...(c.status === "Draft" ? { amount: draftAmount } : {}),
            });
          }}
        >
          {errorText && <div className="form-error">{errorText}</div>}
          <div className="stack">
            {c.status === "Draft" && (
              <label>
                Billed amount ($)
                <input
                  type="number"
                  value={draftAmount}
                  min="0.01"
                  step="0.01"
                  onChange={(e) => setDraftAmount(e.target.value)}
                />
              </label>
            )}
            {Object.entries(flags).map(([key, v]) => (
              <label className="form-check" key={key}>
                <input
                  type="checkbox"
                  checked={v}
                  onChange={(e) =>
                    setFlags({ ...flags, [key]: e.target.checked })
                  }
                />
                {key === "authorized"
                  ? "Prior authorisation verified"
                  : key === "documentation_complete"
                    ? "Documentation complete"
                    : "Eligibility verified"}
              </label>
            ))}
            <p className="form-help">
              Use the status workflow to record payments, adjustments and denial
              history.
            </p>
          </div>
          <div className="modal-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEdit(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
