"use client";

import * as React from "react";
import { startModule } from "@/lib/actions/learning";

/**
 * Records that a learner opened a module.
 *
 * Without this a learner who opens a SCORM package or a video and leaves before
 * finishing still reads as "not started" to their manager. Fires once per module
 * and only when there is no progress yet, so it never overwrites a completion.
 */
export function MarkOpened({ enrollmentId, moduleId }: { enrollmentId: string; moduleId: string }) {
  const marked = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = `${enrollmentId}:${moduleId}`;
    if (marked.current === key) return;
    marked.current = key;
    void startModule(enrollmentId, moduleId).catch(() => {});
  }, [enrollmentId, moduleId]);
  return null;
}
