import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Card, CardBody } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Access denied" };

export default async function DeniedPage() {
  const user = await getCurrentUser();
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-5 py-10">
      <Card className="w-full max-w-[520px]">
        <CardBody className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--danger-bg)] text-[var(--danger)]">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight">You do not have access to that area</h1>
          <p className="mt-2 text-[13.5px] text-[var(--muted)]">
            {user
              ? `Your role (${user.roleName}) does not include this permission, or the record belongs to a restaurant outside your access. Access is enforced on the server, so this is not a display issue.`
              : "Please sign in to continue."}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <LinkButton href="/dashboard" variant="primary">Back to my dashboard</LinkButton>
            <Link href="/login" className="text-[13.5px] font-medium text-[var(--accent)] hover:underline">Switch account</Link>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
