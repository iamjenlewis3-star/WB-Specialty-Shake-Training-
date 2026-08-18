import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className, children, as: Tag = "section", ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(13,21,38,0.04)]",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title, subtitle, action, icon, className,
}: {
  title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode;
  icon?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 text-[var(--muted)]">{icon}</div> : null}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-[var(--muted)]">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

export function PageHeader({
  title, description, actions, breadcrumb,
}: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="mb-5">
      {breadcrumb?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--muted)]">
          {breadcrumb.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-[var(--foreground)] hover:underline">{crumb.label}</Link>
              ) : (
                <span>{crumb.label}</span>
              )}
              {i < breadcrumb.length - 1 ? <span aria-hidden>/</span> : null}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-[14px] text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status + labels                                                     */
/* ------------------------------------------------------------------ */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE_STYLES: Record<Tone, string> = {
  neutral: "bg-[var(--neutral-bg)] text-[var(--muted)]",
  success: "bg-[var(--success-bg)] text-[var(--success)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
  info: "bg-[var(--info-bg)] text-[var(--info)]",
  accent: "bg-[var(--accent)] text-[var(--accent-foreground)]",
};

export function Pill({
  tone = "neutral", children, className, dot = false,
}: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap", TONE_STYLES[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  active: "success", completed: "success", published: "success", attended: "success",
  meets_standard: "success", passed: "success", healthy: "success",
  in_progress: "info", registered: "info", scheduled: "info", invited: "info", pending: "info", draft: "neutral",
  not_started: "neutral", inactive: "neutral", archived: "neutral", canceled: "neutral", skipped: "neutral",
  leave_of_absence: "warning", needs_coaching: "warning", warning: "warning", expiring: "warning", no_show: "warning",
  overdue: "danger", deactivated: "danger", terminated: "danger", expired: "danger", failed: "danger",
  reassessment_required: "danger", critical: "danger",
};

export function StatusPill({ status, className }: { status: string | null | undefined; className?: string }) {
  const key = (status ?? "unknown").toLowerCase();
  const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Pill tone={STATUS_TONES[key] ?? "neutral"} className={className} dot>{label}</Pill>;
}

export function SourcePill({ source }: { source: string | null | undefined }) {
  const isLegacy = (source ?? "").toLowerCase().includes("legacy");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        isLegacy
          ? "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--muted)]"
          : "border-transparent bg-[var(--info-bg)] text-[var(--info)]",
      )}
      title={isLegacy ? "Imported from the previous LMS during migration" : "Created in Wahlburgers Academy"}
    >
      {source ?? "Unknown"}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function ProgressBar({
  value, tone = "info", className, showLabel = false, size = "md",
}: { value: number; tone?: Tone; className?: string; showLabel?: boolean; size?: "sm" | "md" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const barColor: Record<Tone, string> = {
    neutral: "var(--muted-2)", success: "var(--success)", warning: "var(--warning)",
    danger: "var(--danger)", info: "var(--info)", accent: "var(--accent)",
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn("w-full overflow-hidden rounded-full bg-[var(--surface-3)]", size === "sm" ? "h-1.5" : "h-2")}
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: barColor[tone] }} />
      </div>
      {showLabel ? <span className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums">{pct}%</span> : null}
    </div>
  );
}

export function ProgressRing({
  value, size = 96, stroke = 9, tone = "info", label, sublabel,
}: { value: number; size?: number; stroke?: number; tone?: Tone; label?: string; sublabel?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const colors: Record<Tone, string> = {
    neutral: "var(--muted-2)", success: "var(--success)", warning: "var(--warning)",
    danger: "var(--danger)", info: "var(--info)", accent: "var(--accent)",
  };
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${Math.round(pct)} percent`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors[tone]} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[18px] font-semibold tabular-nums">{label ?? `${Math.round(pct)}%`}</span>
        {sublabel ? <span className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">{sublabel}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI tiles                                                           */
/* ------------------------------------------------------------------ */

export function KpiTile({
  label, value, sublabel, tone = "neutral", icon, href, trend,
}: {
  label: string; value: React.ReactNode; sublabel?: React.ReactNode; tone?: Tone;
  icon?: React.ReactNode; href?: string; trend?: { value: number; label?: string };
}) {
  const body = (
    <Card className={cn("h-full p-4 transition-shadow", href && "hover:shadow-[0_4px_16px_rgba(13,21,38,0.10)]")}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>
        {icon ? <span className={cn("rounded-lg p-1.5", TONE_STYLES[tone])}>{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        {trend ? (
          <span className={cn("text-[12px] font-semibold", trend.value >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]")}>
            {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value)}%{trend.label ? ` ${trend.label}` : ""}
          </span>
        ) : null}
      </div>
      {sublabel ? <p className="mt-1.5 text-[12.5px] text-[var(--muted)]">{sublabel}</p> : null}
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/* ------------------------------------------------------------------ */
/* Avatar, empty states, skeletons                                     */
/* ------------------------------------------------------------------ */

export function Avatar({
  name, color, size = 36, className,
}: { name: string; color?: string | null; size?: number; className?: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: color || "#0e1f38", fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function EmptyState({
  title, description, icon, action,
}: { title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-[var(--muted-2)]">{icon}</div> : null}
      <p className="text-[15px] font-semibold">{title}</p>
      {description ? <p className="max-w-md text-[13px] text-[var(--muted)]">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table primitives                                                    */
/* ------------------------------------------------------------------ */

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full min-w-[640px] border-collapse text-[13.5px]", className)}>{children}</table>;
}

export function Th({ children, className, scope = "col" }: { children?: React.ReactNode; className?: string; scope?: string }) {
  return (
    <th scope={scope} className={cn("border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("border-b border-[var(--border)] px-3 py-2.5 align-middle", className)}>{children}</td>;
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("transition-colors hover:bg-[var(--surface-2)]", className)}>{children}</tr>;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-[var(--border)]", className)} />;
}

export function DescriptionList({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--muted)]">{item.label}</dt>
          <dd className="mt-0.5 truncate text-[13.5px]">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
