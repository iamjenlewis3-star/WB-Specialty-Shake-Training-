import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", ...opts }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return formatDate(value, { hour: "numeric", minute: "2-digit" });
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (Math.abs(diffDays) < 1) {
    const hours = Math.round(diffMs / 3600000);
    if (Math.abs(hours) < 1) return "Just now";
    return hours > 0 ? `${hours}h ago` : `in ${Math.abs(hours)}h`;
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays === -1) return "Tomorrow";
  if (diffDays > 0 && diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 0 && diffDays > -30) return `in ${Math.abs(diffDays)} days`;
  return formatDate(date);
}

export function formatNumber(value: number | string | null | undefined, digits = 0): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (num === null || num === undefined || Number.isNaN(num)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(num);
}

export function formatPercent(value: number | string | null | undefined, digits = 0): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (num === null || num === undefined || Number.isNaN(num)) return "0%";
  return `${num.toFixed(digits)}%`;
}

export function formatDuration(seconds: number | string | null | undefined): string {
  const total = Math.round(Number(seconds ?? 0));
  if (!total) return "—";
  const hours = Math.floor(total / 3600);
  const mins = Math.round((total % 3600) / 60);
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export function formatFileSize(bytes: number | string | null | undefined): string {
  const size = Number(bytes ?? 0);
  if (!size) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

export function initialsOf(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function titleCase(value: string): string {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Health/risk banding shared by dashboards, reports and the command center. */
export function healthBand(score: number): { label: string; tone: "success" | "info" | "warning" | "danger" } {
  if (score >= 90) return { label: "Excellent", tone: "success" };
  if (score >= 80) return { label: "Healthy", tone: "info" };
  if (score >= 70) return { label: "Needs Attention", tone: "warning" };
  return { label: "Critical", tone: "danger" };
}

export function completionTone(pct: number, thresholds = { green: 90, yellow: 75 }): "success" | "warning" | "danger" {
  if (pct >= thresholds.green) return "success";
  if (pct >= thresholds.yellow) return "warning";
  return "danger";
}
