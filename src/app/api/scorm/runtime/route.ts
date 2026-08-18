import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { commitScorm } from "@/lib/services/scorm";
import { ensureStarted } from "@/lib/services/progress";

const schema = z.object({
  enrollmentId: z.string().uuid(),
  moduleId: z.string().uuid(),
  cmi: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  finish: z.boolean().optional(),
});

/** SCORM commit endpoint used by the browser-side API adapter. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  await ensureStarted(parsed.data.enrollmentId, user.id);
  const result = await commitScorm({
    enrollmentId: parsed.data.enrollmentId,
    moduleId: parsed.data.moduleId,
    userId: user.id,
    cmi: parsed.data.cmi,
    finish: parsed.data.finish,
  });
  if (!result.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
