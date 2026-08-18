import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AcademyLogo } from "@/components/brand";
import { LoginForm } from "./login-form";
import { ThemeToggle, ThemeProvider } from "@/components/theme-provider";
import { query } from "@/lib/db/client";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // Live counts so the sign-in screen reflects the real system, not a mockup.
  const [stats] = await query<{ locations: string; learners: string; records: string }>(`
    select (select count(*)::text from locations where status = 'active') as locations,
           (select count(*)::text from users where status = 'active') as learners,
           (select count(*)::text from enrollments) as records`);

  return (
    <ThemeProvider>
      <main id="main" className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[var(--wb-navy)] p-10 text-white lg:flex">
          <div className="absolute -right-24 -top-24 size-[420px] rounded-full bg-[var(--wb-red)]/25 blur-3xl" aria-hidden />
          <div className="absolute -bottom-32 -left-16 size-[380px] rounded-full bg-[#e0a33c]/20 blur-3xl" aria-hidden />
          <AcademyLogo size="lg" className="relative text-white" />
          <div className="relative max-w-lg">
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight">
              Our training. Our data. Our platform.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-white/75">
              Wahlburgers Academy brings every course, certification, SCORM module and training record —
              including everything migrated from the previous system — into one platform built for our restaurants.
            </p>
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
              {[
                { label: "Restaurants", value: stats?.locations ?? "0" },
                { label: "Active learners", value: stats?.learners ?? "0" },
                { label: "Training records", value: Number(stats?.records ?? 0).toLocaleString() },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[11px] uppercase tracking-wide text-white/55">{item.label}</dt>
                  <dd className="mt-1 text-[24px] font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="relative text-[12px] text-white/45">
            Fictional demonstration data. No real employee information is stored in this environment.
          </p>
        </section>

        {/* Sign-in panel */}
        <section className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
          <div className="mb-6 flex w-full max-w-[420px] items-center justify-between lg:justify-end">
            <AcademyLogo size="sm" className="lg:hidden" />
            <ThemeToggle />
          </div>
          <div className="w-full max-w-[420px]">
            <h2 className="text-[24px] font-semibold tracking-tight">Sign in to the Academy</h2>
            <p className="mt-1 text-[14px] text-[var(--muted)]">
              Welcome back. Your training, your team and your reporting are waiting.
            </p>
          </div>
          <div className="mt-6 w-full max-w-[420px]">
            <LoginForm />
          </div>
        </section>
      </main>
    </ThemeProvider>
  );
}
