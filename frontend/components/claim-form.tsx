"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, post } from "@/services/api";
const schema = z.object({
  id: z.string().min(3),
  patient_id: z
    .string()
    .regex(/^SYN-[A-Za-z0-9-]+$/, "Use a SYN- synthetic reference."),
  provider_id: z.string().min(1),
  payer_id: z.string().min(1),
  submission_date: z.string().min(1),
  service_date: z.string().min(1),
  amount: z.string().refine((v) => Number(v) > 0, "Amount must be positive."),
  paid_amount: z.string(),
  adjustment: z.string(),
  status: z.string(),
  denial_reason: z.string().optional(),
  appeal_deadline: z.string().optional(),
  procedure_category: z.string(),
  diagnosis_category: z.string(),
  authorized: z.boolean(),
  documentation_complete: z.boolean(),
  eligibility_verified: z.boolean(),
});
export function ClaimForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: refs } = useQuery({
    queryKey: ["references"],
    queryFn: () => api("/references"),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const {
    register,
    watch,
    setValue,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      id: "",
      patient_id: "",
      provider_id: "1",
      payer_id: "1",
      submission_date: "",
      service_date: "",
      amount: "",
      paid_amount: "0",
      adjustment: "0",
      status: "Submitted",
      denial_reason: "",
      appeal_deadline: "",
      procedure_category: "Office visit",
      diagnosis_category: "General",
      authorized: true,
      documentation_complete: true,
      eligibility_verified: true,
    },
  });
  useEffect(() => {
    if (open) {
      const suffix = Date.now().toString(36).toUpperCase();
      const today = new Date().toISOString().slice(0, 10);
      reset({
        id: "CLM-" + suffix,
        patient_id: "SYN-" + suffix,
        provider_id: "1",
        payer_id: "1",
        submission_date: today,
        service_date: today,
        amount: "",
        paid_amount: "0",
        adjustment: "0",
        status: "Submitted",
        denial_reason: "",
        appeal_deadline: "",
        procedure_category: "Office visit",
        diagnosis_category: "General",
        authorized: true,
        documentation_complete: true,
        eligibility_verified: true,
      });
      setError("");
    }
  }, [open, reset]);
  const status = watch("status"),
    amount = watch("amount");
  useEffect(() => {
    setValue("adjustment", (Number(amount) * 0.28).toFixed(2));
    if (status === "Paid" || status === "Recovered")
      setValue("paid_amount", (Number(amount) * 0.72).toFixed(2));
    else if (status === "Closed") {
      setValue("paid_amount", "0");
      setValue("adjustment", Number(amount).toFixed(2));
    } else if (status !== "Partially Paid") setValue("paid_amount", "0");
  }, [amount, status, setValue]);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create a claim"
      description="Add a synthetic claim to your shared workspace."
      wide
    >
      <form
        onSubmit={handleSubmit(async (values) => {
          setBusy(true);
          setError("");
          try {
            const data = {
              ...values,
              provider_id: Number(values.provider_id),
              payer_id: Number(values.payer_id),
              denial_reason: values.denial_reason || null,
              appeal_deadline: values.appeal_deadline || null,
              synthetic: true,
            };
            const result = await post("/claims", data);
            qc.invalidateQueries();
            toast.success("Claim created successfully.");
            onOpenChange(false);
            onCreated?.(result.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        })}
      >
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <label>
            Claim ID
            <input {...register("id")} />
            {errors.id && (
              <small className="field-error">{errors.id.message}</small>
            )}
          </label>
          <label>
            Synthetic patient reference
            <input {...register("patient_id")} />
            {errors.patient_id && (
              <small className="field-error">{errors.patient_id.message}</small>
            )}
          </label>
          <label>
            Payer
            <select {...register("payer_id")}>
              {refs?.payers.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provider
            <select {...register("provider_id")}>
              {refs?.providers.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Submission date
            <input
              {...register("submission_date")}
              type="date"
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            Service date
            <input
              {...register("service_date")}
              type="date"
              max={watch("submission_date")}
            />
          </label>
          <label>
            Billed amount ($)
            <input
              {...register("amount")}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
            />
            {errors.amount && (
              <small className="field-error">{errors.amount.message}</small>
            )}
          </label>
          <label>
            Claim status
            <select {...register("status")}>
              {refs?.statuses.map((s: string) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Recorded payments ($)
            <input
              {...register("paid_amount")}
              type="number"
              min="0"
              step="0.01"
            />
          </label>
          <label>
            Contractual adjustments ($)
            <input
              {...register("adjustment")}
              type="number"
              min="0"
              step="0.01"
            />
          </label>
          {["Denied", "Appealed", "Recovered", "Closed"].includes(status) && (
            <>
              <label>
                Denial reason
                <select {...register("denial_reason")}>
                  <option value="">Select reason</option>
                  {refs?.reasons.map((r: string) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label>
                Appeal deadline
                <input {...register("appeal_deadline")} type="date" />
              </label>
            </>
          )}
          <label>
            Procedure category
            <select {...register("procedure_category")}>
              {[
                "Office visit",
                "Imaging",
                "Surgery",
                "Laboratory",
                "Therapy",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Diagnosis category
            <select {...register("diagnosis_category")}>
              {[
                "General",
                "Cardiovascular",
                "Musculoskeletal",
                "Respiratory",
                "Metabolic",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="check-grid full">
            <label className="form-check">
              <input type="checkbox" {...register("authorized")} />
              Prior authorisation
            </label>
            <label className="form-check">
              <input type="checkbox" {...register("documentation_complete")} />
              Complete documentation
            </label>
            <label className="form-check">
              <input type="checkbox" {...register("eligibility_verified")} />
              Eligibility verified
            </label>
          </div>
          <p className="form-help full">
            <ShieldCheck size={12} className="inline" /> Synthetic records only.
            Expected insurer reimbursement uses a labelled 72% contract
            assumption; you can review all balances after creation.
          </p>
        </div>
        <div className="modal-footer">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle size={14} className="spin" />}Create claim
          </Button>
        </div>
      </form>
    </Modal>
  );
}
