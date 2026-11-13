"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Activity,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  BarChart3,
  Files,
  Check,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { Logo } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { api, post } from "@/services/api";
const schema = z.object({
  name: z.string().optional(),
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
export function AuthPage({ register = false }: { register?: boolean }) {
  const router = useRouter(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [show, setShow] = useState(false);
  const { data: config } = useQuery({
    queryKey: ["auth-config"],
    queryFn: () => api("/auth/config"),
  });
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });
  const go = async (path: string, data?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const user = await post(path, data || {});
      qc.setQueryData(["me"], user);
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-main">
          <span className="auth-eyebrow">HEALTHCARE REVENUE INTELLIGENCE</span>
          <h1>
            Every claim has a story.
            <br />
            <em>See the whole picture.</em>
          </h1>
          <p>
            Turn complex claims data into clear priorities. Understand denials,
            find revenue at risk and put your next action in focus.
          </p>
          <div className="auth-flow">
            <div>
              <span>
                <Files size={22} />
              </span>
              <strong>Understand</strong>
              <small>Your claims, connected</small>
            </div>
            <i />
            <div>
              <span>
                <BarChart3 size={22} />
              </span>
              <strong>Discover</strong>
              <small>The patterns that matter</small>
            </div>
            <i />
            <div>
              <span>
                <Check size={22} />
              </span>
              <strong>Prioritise</strong>
              <small>A clearer next action</small>
            </div>
          </div>
        </div>
        <div className="auth-disclaimer">
          <ShieldCheck size={20} />
          <p>
            An independent portfolio project.
            <br />
            <strong>Fully synthetic data. Built for exploration.</strong>
          </p>
        </div>
        <div className="auth-grid-decoration" />
      </section>
      <section className="auth-form-side">
        <div className="auth-form">
          <div className="auth-mobile-logo">
            <Logo />
          </div>
          <span className="badge teal">CLAIMPULSE AI WORKSPACE</span>
          <h2>
            {register ? "Make room for clarity." : "Welcome to your workspace."}
          </h2>
          <p>
            {register
              ? "Create your analyst account to explore the synthetic workspace."
              : "Sign in to explore your claims and revenue intelligence."}
          </p>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          <form
            onSubmit={handleSubmit((values) => {
              if (register && values.password.length < 12) {
                setError("Choose a password with at least 12 characters.");
                return;
              }
              if (register && (!values.name || values.name.length < 2)) {
                setError("Enter your name (at least 2 characters).");
                return;
              }
              go(register ? "/auth/register" : "/auth/login", values);
            })}
          >
            {register && (
              <label>
                Full name
                <input
                  {...field("name")}
                  placeholder="Alex Morgan"
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                {...field("email")}
                type="email"
                placeholder="you@organisation.com"
                autoComplete="email"
              />
              {errors.email && (
                <small className="field-error">{errors.email.message}</small>
              )}
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  {...field("password")}
                  type={show ? "text" : "password"}
                  placeholder={
                    register ? "At least 12 characters" : "Enter your password"
                  }
                  autoComplete={register ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && (
                <small className="field-error">{errors.password.message}</small>
              )}
            </label>
            <Button disabled={busy} type="submit" className="full-width">
              {busy ? <LoaderCircle className="spin" size={17} /> : null}
              {register ? "Create account" : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          {config?.demo_mode && (
            <>
              <div className="auth-or">
                <span />
                or explore the portfolio demo
                <span />
              </div>
              <Button
                variant="outline"
                disabled={busy}
                className="full-width"
                onClick={() => go("/auth/demo")}
              >
                Enter synthetic demo <ArrowUpRightIcon />
              </Button>
              <p className="auth-demo-copy">
                No credentials needed. Shared demo workspace.
                <br />
                Please use synthetic information only.
              </p>
            </>
          )}
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to ClaimPulse?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <div className="auth-secure">
            <LockKeyhole size={13} />
            Secure session · Synthetic records only
          </div>
        </div>
        <span className="auth-bottom">
          Healthcare intelligence, made clear.
        </span>
      </section>
    </div>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
      <path d="M7 17 17 7M7 7h10v10" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
