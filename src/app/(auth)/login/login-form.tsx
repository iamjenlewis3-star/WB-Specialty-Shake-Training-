"use client";

import * as React from "react";
import { useActionState } from "react";
import { Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { signIn, type LoginState } from "@/lib/actions/auth";
import { Field, TextInput, SubmitButton } from "@/components/ui/interactive";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = [
  { email: "admin@wahlburgers.test", label: "Corporate Administrator", detail: "Full system access" },
  { email: "training@wahlburgers.test", label: "Corporate Training", detail: "Content, assignments, reporting" },
  { email: "exec@wahlburgers.test", label: "Executive", detail: "Read-only leadership analytics" },
  { email: "fbp@wahlburgers.test", label: "Franchise Business Partner", detail: "Assigned restaurant portfolio" },
  { email: "owner@wahlburgers.test", label: "Franchise Owner", detail: "Harborline Restaurant Group" },
  { email: "gm@wahlburgers.test", label: "General Manager", detail: "Boston Seaport" },
  { email: "cook@wahlburgers.test", label: "Cook (Learner)", detail: "Boston Seaport" },
  { email: "host@wahlburgers.test", label: "Host (Learner)", detail: "Boston Seaport · new hire" },
];

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {});
  const [showPassword, setShowPassword] = React.useState(false);
  const [identifier, setIdentifier] = React.useState("admin@wahlburgers.test");
  const [password, setPassword] = React.useState("Academy2026!");

  return (
    <div className="w-full max-w-[420px]">
      <form action={formAction} className="space-y-4">
        {state.error ? (
          <div role="alert" className="rounded-lg border border-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--danger)]">
            {state.error}
          </div>
        ) : null}

        <Field label="Email or username" required error={state.fieldErrors?.identifier}>
          <TextInput
            name="identifier" autoComplete="username" required value={identifier}
            onChange={(e) => setIdentifier(e.target.value)} placeholder="you@wahlburgers.com"
          />
        </Field>

        <Field label="Password" required error={state.fieldErrors?.password}>
          <div className="relative">
            <TextInput
              name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10"
            />
            <button
              type="button" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--muted)]">
            <input type="checkbox" name="remember" defaultChecked className="size-4 rounded accent-[var(--accent)]" />
            Remember me
          </label>
          <a href="/login/forgot" className="text-[13px] font-medium text-[var(--accent)] hover:underline">
            Forgot password?
          </a>
        </div>

        <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
          <LogIn size={17} /> Sign in
        </SubmitButton>

        <button
          type="button" disabled
          title="Single sign-on integration point — wired to the identity provider at rollout"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] px-4 py-2.5 text-[13px] font-medium text-[var(--muted)]"
        >
          <ShieldCheck size={16} /> Continue with Wahlburgers SSO (coming soon)
        </button>
      </form>

      <div className="mt-7">
        <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Demo accounts — password <span className="font-mono text-[var(--foreground)]">Academy2026!</span>
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((acct) => (
            <button
              key={acct.email} type="button"
              onClick={() => { setIdentifier(acct.email); setPassword("Academy2026!"); }}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition-colors",
                identifier === acct.email
                  ? "border-[var(--accent)] bg-[var(--accent)]/5"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
              )}
            >
              <span className="block text-[12.5px] font-semibold">{acct.label}</span>
              <span className="block text-[11px] text-[var(--muted)]">{acct.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
