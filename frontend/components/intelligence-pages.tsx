"use client";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BrainCircuit,
  RefreshCw,
  LoaderCircle,
  ShieldCheck,
  Send,
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  Search,
  Clock3,
  FileCheck2,
  BarChart3,
  Info,
  CheckCircle2,
} from "lucide-react";
import { api, post } from "@/services/api";
import {
  PageHeader,
  Panel,
  Loading,
  ErrorState,
  Stat,
  Badge,
  Empty,
  Insight,
  useData,
  queryString,
  MetricNote,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { usePeriod } from "@/components/providers";
import { dateLabel, money, number } from "@/lib/utils";
export function PredictivePage() {
  const qc = useQueryClient();
  const {
    data: report,
    isPending,
    error,
    refetch,
  } = useQuery({ queryKey: ["ml-status"], queryFn: () => api("/ml/status") });
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/auth/me"),
  });
  const { data: claims } = useData("/claims", {
    status: "Submitted",
    page_size: 100,
  });
  const [busy, setBusy] = useState(false),
    [predictBusy, setPredictBusy] = useState(false),
    [cid, setCid] = useState(""),
    [prediction, setPrediction] = useState<any>(null);
  const train = async () => {
    setBusy(true);
    try {
      await post("/ml/train");
      await qc.invalidateQueries({ queryKey: ["ml-status"] });
      toast.success("Models trained and evaluated.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (isPending) return <Loading />;
  if (error) return <ErrorState error={error} retry={refetch} />;
  const trained = !!report.best_model;
  const best = trained
    ? report.models.find((m: any) => m.model === report.best_model)
    : null;
  const matrix = best?.confusion_matrix || [
    [0, 0],
    [0, 0],
  ];
  const maxImp = trained
    ? Math.max(
        0.001,
        ...report.feature_importance.map((f: any) => f.importance),
      )
    : 1;
  return (
    <>
      <PageHeader
        eyebrow="PREDICTIVE INTELLIGENCE"
        title="Review risk before the outcome."
        description="Experimental denial estimates from historical synthetic claim outcomes."
        date={false}
      />
      <div className="ml-training">
        <span>
          <BrainCircuit size={23} />
        </span>
        <div>
          <strong>
            {trained
              ? report.best_model + " · validated on a chronological holdout"
              : "Your model workspace is ready."}
          </strong>
          <p>
            {trained
              ? `${number(report.sample_count)} adjudicated records · Trained ${dateLabel(report.trained_at)} · Threshold 0.50`
              : "Train Logistic Regression and Random Forest using the seeded historical claims. No paid API is needed."}
          </p>
        </div>
        <Button onClick={train} disabled={busy || user?.role !== "admin"}>
          {busy ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <RefreshCw size={14} />
          )}{" "}
          {busy
            ? "Training models…"
            : trained
              ? "Retrain models"
              : "Train models"}
        </Button>
        {user?.role !== "admin" && (
          <small className="muted">Admin access required</small>
        )}
      </div>
      {trained && (
        <>
          <div className="stats-grid four">
            {[
              ["ROC-AUC", best.roc_auc],
              ["Precision", best.precision],
              ["Recall", best.recall],
              ["F1-score", best.f1],
            ].map(([label, value]) => (
              <Stat
                key={label}
                label={label}
                value={Number(value).toFixed(3)}
                footnote={`Held-out test · ${number(report.test_count)} records`}
                icon={BarChart3}
              />
            ))}
          </div>
          <Panel
            title="Model comparison"
            description="Selection uses validation ROC-AUC. The metrics below are from the untouched test cohort."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Model",
                      "Validation ROC-AUC",
                      "Test ROC-AUC",
                      "Precision",
                      "Recall",
                      "F1",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.models.map((m: any) => (
                    <tr key={m.model}>
                      <td>
                        <strong>{m.model}</strong>{" "}
                        {m.model === report.best_model && (
                          <Badge tone="teal">Selected</Badge>
                        )}
                      </td>
                      {[
                        "validation_roc_auc",
                        "roc_auc",
                        "precision",
                        "recall",
                        "f1",
                      ].map((k) => (
                        <td key={k}>{m[k].toFixed(3)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="analysis-table-footer">
              {report.split} Train: {number(report.train_count)} · Validation:{" "}
              {number(report.validation_count)} · Test:{" "}
              {number(report.test_count)}. Test cohort begins{" "}
              {dateLabel(report.test_start)}.
            </div>
          </Panel>
          <div className="two-column equal" style={{ marginTop: 20 }}>
            <Panel
              title="What the model relies on"
              description="Permutation importance: decrease in test ROC-AUC after feature shuffling"
            >
              <div className="feature-list">
                {report.feature_importance.map((f: any) => (
                  <div key={f.feature} className="feature-item">
                    <div>
                      <span>{f.feature.replaceAll("_", " ")}</span>
                      <strong>{f.importance.toFixed(4)}</strong>
                    </div>
                    <div className="feature-track">
                      <i
                        style={{
                          width:
                            (Math.max(0, f.importance) / maxImp) * 100 + "%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title="Confusion matrix"
              description="Observed outcome × predicted class on the held-out cohort"
            >
              <div className="confusion-matrix">
                <span />
                <span className="matrix-axis">Predicted: approved</span>
                <span className="matrix-axis">Predicted: denied</span>
                <span className="matrix-axis">
                  Actual
                  <br />
                  approved
                </span>
                <div className="matrix-cell good">
                  <strong>{number(matrix[0][0])}</strong>
                  <small>True negatives</small>
                </div>
                <div className="matrix-cell">
                  <strong>{number(matrix[0][1])}</strong>
                  <small>False positives</small>
                </div>
                <span className="matrix-axis">
                  Actual
                  <br />
                  denied
                </span>
                <div className="matrix-cell">
                  <strong>{number(matrix[1][0])}</strong>
                  <small>False negatives</small>
                </div>
                <div className="matrix-cell good">
                  <strong>{number(matrix[1][1])}</strong>
                  <small>True positives</small>
                </div>
              </div>
              <div className="recommendation">
                “Approved” here means an adjudicated record without historical
                denial, including partial payment. The model does not make
                actual payer decisions.
              </div>
            </Panel>
          </div>
        </>
      )}
      {!trained && (
        <Empty
          title="No trained model yet"
          description="Use Train models to create the baseline and comparison. Results will appear here after successful evaluation."
        />
      )}
      <Panel
        title="Explore a claim’s estimated denial risk"
        description="Pre-outcome features only. This is a synthetic demonstration."
      >
        <div className="panel-body">
          <form
            className="row"
            style={{ flexWrap: "wrap" }}
            onSubmit={async (e) => {
              e.preventDefault();
              setPredictBusy(true);
              try {
                setPrediction(
                  await post("/ml/predict/" + encodeURIComponent(cid)),
                );
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setPredictBusy(false);
              }
            }}
          >
            <select
              aria-label="Claim for prediction"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            >
              <option value="">Choose a submitted claim</option>
              {claims?.items.map((c: any) => (
                <option value={c.id} key={c.id}>
                  {c.id} · {c.payer} · {money(c.amount)}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={!trained || !cid || predictBusy}>
              {predictBusy ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <BrainCircuit size={14} />
              )}
              Estimate denial risk
            </Button>
          </form>
          {prediction && (
            <div className="prediction-result">
              <div className="row">
                <Link
                  className="claim-link"
                  href={"/claims/" + prediction.claim_id}
                >
                  {prediction.claim_id}{" "}
                  <ArrowUpRight size={12} className="inline" />
                </Link>
                <Badge
                  tone={
                    prediction.category === "High"
                      ? "red"
                      : prediction.category === "Medium"
                        ? "amber"
                        : "teal"
                  }
                >
                  {prediction.category} estimated risk
                </Badge>
              </div>
              <div className="prediction-risk">
                <strong>{prediction.estimated_risk}%</strong>
                <span className="form-help">
                  Experimental score · Synthetic data
                </span>
              </div>
              <p>{prediction.explanation}</p>
              {prediction.factors.length > 0 && (
                <div className="financial-lines" style={{ padding: "10px 0" }}>
                  {prediction.factors.map((f: any) => (
                    <div key={f.feature}>
                      <span>{f.feature.replaceAll("_", " ")}</span>
                      <strong>
                        {f.contribution > 0 ? "+" : ""}
                        {f.contribution} pp
                      </strong>
                    </div>
                  ))}
                </div>
              )}
              <ul>
                {prediction.actions.map((a: string) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>
      <div className="risk-callout" style={{ marginTop: 20 }}>
        <strong>Model limitations.</strong>{" "}
        {trained
          ? report.limitations
          : "Models are trained only on synthetic outcomes and cannot generalise to real payer or provider data."}{" "}
        No post-outcome fields (denial reason, status, payments or appeal
        outcome) are used as predictors. This does not replace certified coding
        review or insurance decisions.
      </div>
    </>
  );
}
const prompts = [
  ["What are the top three denial reasons in this period?", FileCheck2],
  ["Which payer has the highest denial rate?", BarChart3],
  ["Which claims are outstanding for more than 90 days?", Clock3],
  ["What is the total revenue at risk?", ShieldCheck],
  ["Which high-value claims should be reviewed first?", Search],
  ["What changed in the denial rate?", RefreshCw],
] as const;
export function CopilotPage() {
  const { period } = usePeriod();
  const [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<any[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const result = await post("/copilot", { question: q, ...period });
      setMessages((m) => [...m, { role: "assistant", ...result }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "error", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="copilot-layout">
      <PageHeader
        eyebrow="YOUR ANALYTICS ASSISTANT"
        title="ClaimPulse Copilot"
        description="Ask a question. Follow the evidence."
      />
      <div className="copilot-welcome">
        <span className="copilot-mark">
          <Sparkles size={29} />
        </span>
        <h2>Clarity starts with a question.</h2>
        <p>
          Explore your synthetic claims through approved analytical queries.
          Every answer comes with its period, calculation and supporting data.
        </p>
      </div>
      {!messages.length && (
        <div className="copilot-prompts">
          {prompts.map(([text, Icon]) => (
            <button disabled={busy} key={text} onClick={() => ask(text)}>
              <span className="row">
                <Icon size={17} />
                {text}
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      )}
      <div className="chat-messages">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div className="chat-message user-message" key={i}>
              <p>{m.text}</p>
            </div>
          ) : m.role === "error" ? (
            <div className="form-error" role="alert" key={i}>
              {m.text}
            </div>
          ) : (
            <div className="chat-message assistant-message" key={i}>
              <div className="assistant-label">
                <Sparkles size={16} />
                ClaimPulse Copilot <Badge tone="teal">Database grounded</Badge>
              </div>
              <p>{m.answer}</p>
              {m.evidence?.length > 0 && (
                <details className="evidence-details" open>
                  <summary>Supporting data · {m.evidence.length} rows</summary>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {Object.keys(m.evidence[0]).map((k) => (
                            <th key={k}>{k.replaceAll("_", " ")}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.evidence.map((row: any, j: number) => (
                          <tr key={j}>
                            {Object.entries(row).map(([k, v]) => (
                              <td key={k}>
                                {k === "id" ? (
                                  <Link
                                    className="claim-link"
                                    href={"/claims/" + v}
                                  >
                                    {String(v)}
                                  </Link>
                                ) : typeof v === "number" ? (
                                  k.includes("amount") ||
                                  k.includes("outstanding") ? (
                                    money(v)
                                  ) : (
                                    number(v)
                                  )
                                ) : (
                                  String(v)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              {m.claim_links?.length > 0 && (
                <div className="claim-evidence-links">
                  {m.claim_links.map((id: string) => (
                    <Link href={"/claims/" + id} key={id}>
                      {id} <ArrowUpRight size={11} className="inline" />
                    </Link>
                  ))}
                </div>
              )}
              <div className="answer-source">
                <ShieldCheck size={11} />
                {m.source}
                <span>·</span>
                {dateLabel(m.period.start)} – {dateLabel(m.period.end)}
                <span>·</span>Submission date cohort <span>·</span>
                {m.engine}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="assistant-message row">
            <LoaderCircle size={16} className="spin" />
            <span className="form-help">
              Querying approved metrics and validating the evidence…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="copilot-compose"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <textarea
          aria-label="Ask ClaimPulse Copilot"
          value={question}
          maxLength={1000}
          placeholder="Ask about denials, revenue at risk or your next priority…"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
        />
        <Button
          disabled={busy || !question.trim()}
          type="submit"
          aria-label="Send question"
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <ArrowRight size={18} />
          )}
        </Button>
      </form>
      <p className="copilot-safety">
        Controlled analytical queries · No arbitrary SQL · Selected period shown
        with every answer
        <br />
        Synthetic data only. Copilot does not make medical, coding or insurance
        decisions.
      </p>
    </div>
  );
}
