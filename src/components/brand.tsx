import * as React from "react";
import { cn } from "@/lib/utils";

/** Wahlburgers Academy wordmark. Pure SVG/CSS so it renders in both themes. */
export function AcademyLogo({
  size = "md", className, showSubtitle = true,
}: { size?: "sm" | "md" | "lg"; className?: string; showSubtitle?: boolean }) {
  const dims = { sm: { box: 30, title: "text-[14px]", sub: "text-[9px]" }, md: { box: 40, title: "text-[17px]", sub: "text-[10px]" }, lg: { box: 54, title: "text-[23px]", sub: "text-[11px]" } }[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--wb-navy)] text-white shadow-sm"
        style={{ width: dims.box, height: dims.box }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" width={dims.box * 0.6} height={dims.box * 0.6} fill="none">
          <path d="M3 9.5c0-3 4-5.5 9-5.5s9 2.5 9 5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="3" y="10.6" width="18" height="2.6" rx="1.3" fill="#c8102e" />
          <path d="M3.4 15.2h17.2c0 2.6-3.9 4.6-8.6 4.6s-8.6-2-8.6-4.6Z" fill="#e0a33c" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className={cn("font-semibold tracking-tight", dims.title)}>Wahlburgers</span>
        {showSubtitle ? (
          <span className={cn("mt-1 font-semibold uppercase tracking-[0.22em] text-[var(--accent)]", dims.sub)}>Academy</span>
        ) : null}
      </span>
    </span>
  );
}
