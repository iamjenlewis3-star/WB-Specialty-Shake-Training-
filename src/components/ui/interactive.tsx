"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { X, ChevronDown, Search, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass } from "./button";

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
const ToastContext = React.createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-fade-up pointer-events-auto rounded-lg border px-4 py-3 text-[13.5px] font-medium shadow-lg",
              t.tone === "error"
                ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
                : t.tone === "info"
                ? "border-[var(--info)] bg-[var(--info-bg)] text-[var(--info)]"
                : "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Surfaces `?toast=` messages produced by server-action redirects. */
export function ToastListener() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const message = params.get("toast");
  const tone = (params.get("tone") as Toast["tone"]) ?? "success";
  React.useEffect(() => {
    if (!message) return;
    toast(message, tone);
    const next = new URLSearchParams(params.toString());
    next.delete("toast");
    next.delete("tone");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Modal + Drawer                                                      */
/* ------------------------------------------------------------------ */

export function Modal({
  open, onClose, title, description, children, footer, size = "md",
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} tabIndex={-1} />
      <div className={cn("animate-fade-up relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl", widths[size])}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-[13px] text-[var(--muted)]">{description}</p> : null}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-3)]">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open, onClose, title, children, footer, width = "480px",
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; width?: string }) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 cursor-default" aria-label="Close drawer" onClick={onClose} tabIndex={-1} />
      <aside
        className="relative flex h-full w-full max-w-full flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        style={{ width: `min(100%, ${width})` }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--surface-3)]">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div> : null}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export const inputClass =
  "h-9 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--foreground)] placeholder:text-[var(--muted-2)] focus:border-[var(--ring)] focus:outline-none";

export function Field({
  label, hint, error, required, children, className,
}: { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 flex items-center gap-1 text-[12.5px] font-medium text-[var(--foreground)]">
        {label}
        {required ? <span className="text-[var(--danger)]">*</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block text-[11.5px] text-[var(--muted)]">{hint}</span> : null}
      {error ? <span className="mt-1 block text-[11.5px] font-medium text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto min-h-24 py-2", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, "pr-8", props.className)} />;
}

export function Checkbox({
  label, description, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input type="checkbox" {...props} className="mt-0.5 size-4 rounded border-[var(--border-strong)] accent-[var(--accent)]" />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{label}</span>
        {description ? <span className="block text-[12px] text-[var(--muted)]">{description}</span> : null}
      </span>
    </label>
  );
}

/** Submit button that reflects the enclosing form's pending state. */
export function SubmitButton({
  children, variant = "primary", size = "md", className, pendingLabel,
}: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" | "accent" | "outline";
  size?: "sm" | "md" | "lg"; className?: string; pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 size={15} className="animate-spin" /> : null}
      {pending ? pendingLabel ?? "Working…" : children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* URL-driven filters (server-side filtering & pagination)             */
/* ------------------------------------------------------------------ */

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (updates: Record<string, string | null>, options: { resetPage?: boolean } = { resetPage: true }) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      });
      if (options.resetPage !== false) next.delete("page");
      router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [router, pathname, params],
  );
}

export function SearchInput({ placeholder = "Search…", paramKey = "q", className }: { placeholder?: string; paramKey?: string; className?: string }) {
  const params = useSearchParams();
  const setUrl = useUrlState();
  const [value, setValue] = React.useState(params.get(paramKey) ?? "");
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => { setValue(params.get(paramKey) ?? ""); }, [params, paramKey]);

  React.useEffect(() => {
    const current = params.get(paramKey) ?? "";
    if (value === current) return;
    const timer = setTimeout(() => startTransition(() => setUrl({ [paramKey]: value || null })), 320);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
      <input
        type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder}
        aria-label={placeholder} className={cn(inputClass, "pl-8", isPending && "opacity-70")}
      />
    </div>
  );
}

export function FilterSelect({
  paramKey, options, label, allLabel = "All", className,
}: {
  paramKey: string; label: string; allLabel?: string; className?: string;
  options: Array<{ value: string; label: string }>;
}) {
  const params = useSearchParams();
  const setUrl = useUrlState();
  const value = params.get(paramKey) ?? "";
  return (
    <select
      aria-label={label} value={value} onChange={(e) => setUrl({ [paramKey]: e.target.value || null })}
      className={cn(inputClass, "w-auto min-w-[9rem] pr-7", value && "border-[var(--ring)] font-medium", className)}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function FilterChips({
  paramKey, options,
}: { paramKey: string; options: Array<{ value: string; label: string }> }) {
  const params = useSearchParams();
  const setUrl = useUrlState();
  const active = params.get(paramKey) ?? "";
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const isActive = active === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setUrl({ [paramKey]: isActive ? null : o.value })}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
              isActive
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ClearFilters({ keys }: { keys: string[] }) {
  const params = useSearchParams();
  const setUrl = useUrlState();
  const hasFilters = keys.some((k) => params.get(k));
  if (!hasFilters) return null;
  return (
    <button
      onClick={() => setUrl(Object.fromEntries(keys.map((k) => [k, null])))}
      className="text-[12.5px] font-medium text-[var(--accent)] hover:underline"
    >
      Clear filters
    </button>
  );
}

export function Pagination({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const setUrl = useUrlState();
  if (pageCount <= 1) {
    return <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">{total.toLocaleString()} record{total === 1 ? "" : "s"}</p>;
  }
  const go = (p: number) => setUrl({ page: String(p) }, { resetPage: false });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <p className="text-[12.5px] text-[var(--muted)]">
        Page {page} of {pageCount} · {total.toLocaleString()} records
      </p>
      <div className="flex items-center gap-1.5">
        <button onClick={() => go(Math.max(1, page - 1))} disabled={page <= 1} className={buttonClass("outline", "sm")}>Previous</button>
        <button onClick={() => go(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className={buttonClass("outline", "sm")}>Next</button>
      </div>
    </div>
  );
}

export function SortHeader({ column, label, className }: { column: string; label: string; className?: string }) {
  const params = useSearchParams();
  const setUrl = useUrlState();
  const sort = params.get("sort");
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const isActive = sort === column;
  return (
    <button
      onClick={() => setUrl({ sort: column, dir: isActive && dir === "desc" ? "asc" : "desc" }, { resetPage: false })}
      className={cn("inline-flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide", isActive ? "text-[var(--foreground)]" : "text-[var(--muted)]", className)}
    >
      {label}
      <ChevronDown size={12} className={cn("transition-transform", isActive && dir === "asc" && "rotate-180", !isActive && "opacity-30")} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs, disclosure, dropdown                                          */
/* ------------------------------------------------------------------ */

export function Tabs({
  tabs, active, onChange,
}: { tabs: Array<{ id: string; label: string; count?: number }>; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id} role="tab" aria-selected={active === tab.id} onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] font-medium transition-colors",
            active === tab.id
              ? "border-[var(--accent)] text-[var(--foreground)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="ml-1.5 text-[11.5px] text-[var(--muted-2)]">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Dropdown({
  trigger, children, align = "right",
}: { trigger: React.ReactNode; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="block">
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={cn(
            "animate-fade-up absolute z-50 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children, onClick, href, tone = "default", icon,
}: { children: React.ReactNode; onClick?: () => void; href?: string; tone?: "default" | "danger"; icon?: React.ReactNode }) {
  const cls = cn(
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-[var(--surface-3)]",
    tone === "danger" ? "text-[var(--danger)]" : "text-[var(--foreground)]",
  );
  if (href) return <a href={href} className={cls} role="menuitem">{icon}{children}</a>;
  return <button onClick={onClick} className={cls} role="menuitem">{icon}{children}</button>;
}

export function Disclosure({ summary, children, defaultOpen = false }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-[var(--border)] last:border-b-0">
      <summary className="flex cursor-pointer items-center justify-between gap-2 py-3 text-[13.5px] font-medium marker:content-none">
        {summary}
        <ChevronDown size={16} className="text-[var(--muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

export function CheckIcon() {
  return <Check size={14} />;
}
