"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { selfEnroll } from "@/lib/actions/learning";
import { buttonClass } from "@/components/ui/button";

export function SelfEnrollButton({ courseId }: { courseId: string }) {
  const [pending, startTransition] = React.useTransition();
  return (
    <button
      onClick={() => startTransition(() => selfEnroll(courseId))}
      disabled={pending}
      className={buttonClass("primary", "lg", "w-full")}
    >
      <Plus size={17} /> {pending ? "Adding…" : "Add to my learning"}
    </button>
  );
}
