"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { submitCourseReview } from "@/lib/actions/training";
import { SubmitButton, TextArea } from "@/components/ui/interactive";
import { cn } from "@/lib/utils";

const SCALES = [
  { name: "useful", label: "Was this training useful?" },
  { name: "easy", label: "Was it easy to understand?" },
  { name: "relevant", label: "Was it relevant to your role?" },
  { name: "confident", label: "Do you feel more confident?" },
];

export function CourseReviewForm({ courseId, enrollmentId }: { courseId: string; enrollmentId?: string }) {
  const [rating, setRating] = React.useState(5);
  const [scales, setScales] = React.useState<Record<string, number>>({ useful: 5, easy: 5, relevant: 5, confident: 4 });

  return (
    <form action={submitCourseReview} className="space-y-4">
      <input type="hidden" name="courseId" value={courseId} />
      {enrollmentId ? <input type="hidden" name="enrollmentId" value={enrollmentId} /> : null}
      <input type="hidden" name="rating" value={rating} />
      {SCALES.map((s) => <input key={s.name} type="hidden" name={s.name} value={scales[s.name]} />)}

      <div>
        <p className="mb-1.5 text-[12.5px] font-medium">Overall rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className={cn("rounded p-1", n <= rating ? "text-[var(--wb-gold)]" : "text-[var(--muted-2)]")}
            >
              <Star size={22} fill={n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SCALES.map((s) => (
          <div key={s.name}>
            <p className="mb-1 text-[12.5px] font-medium">{s.label}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button" onClick={() => setScales((prev) => ({ ...prev, [s.name]: n }))}
                  className={cn(
                    "size-8 rounded-lg border text-[12.5px] font-semibold",
                    scales[s.name] === n ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)]",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1 text-[12.5px] font-medium">Anything else? (optional)</p>
        <TextArea name="comments" placeholder="What worked, what would make this training better…" maxLength={2000} />
      </div>

      <SubmitButton pendingLabel="Sending…">Submit feedback</SubmitButton>
    </form>
  );
}
