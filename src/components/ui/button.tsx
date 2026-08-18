import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
  accent: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90",
  secondary: "bg-[var(--surface-3)] text-[var(--foreground)] hover:bg-[var(--border)]",
  outline: "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[12.5px] gap-1.5",
  md: "h-9 px-3.5 text-[13.5px] gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  cn(
    "inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 whitespace-nowrap",
    VARIANTS[variant], SIZES[size], className,
  );

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  href, variant = "primary", size = "md", className, children, target, prefetch,
}: {
  href: string; variant?: Variant; size?: Size; className?: string;
  children: React.ReactNode; target?: string; prefetch?: boolean;
}) {
  return (
    <Link href={href} target={target} prefetch={prefetch} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
