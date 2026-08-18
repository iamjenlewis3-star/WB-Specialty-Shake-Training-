"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "./button";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className={buttonClass("outline", "sm", "no-print")}>
      <Printer size={15} /> {label}
    </button>
  );
}
