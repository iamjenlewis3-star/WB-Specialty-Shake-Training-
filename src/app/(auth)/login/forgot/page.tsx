import Link from "next/link";
import { AcademyLogo } from "@/components/brand";
import { Card, CardBody } from "@/components/ui/primitives";
import { requestPasswordReset } from "@/lib/actions/account";
import { SubmitButton, Field, TextInput } from "@/components/ui/interactive";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({
  searchParams,
}: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <AcademyLogo size="lg" className="mb-8" />
      <Card className="w-full max-w-[440px]">
        <CardBody>
          <h1 className="text-[20px] font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            Enter the email on your Academy account. Your manager or Corporate Training will be notified to
            help you reset it.
          </p>
          {sent ? (
            <div role="status" className="mt-4 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2.5 text-[13px] font-medium text-[var(--success)]">
              If that account exists, a reset request has been sent to the account administrators.
            </div>
          ) : (
            <form action={requestPasswordReset} className="mt-4 space-y-4">
              <Field label="Email address" required>
                <TextInput name="email" type="email" required placeholder="you@wahlburgers.com" />
              </Field>
              <SubmitButton className="w-full" pendingLabel="Sending…">Send reset request</SubmitButton>
            </form>
          )}
          <Link href="/login" className="mt-4 inline-block text-[13px] font-medium text-[var(--accent)] hover:underline">
            ← Back to sign in
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
