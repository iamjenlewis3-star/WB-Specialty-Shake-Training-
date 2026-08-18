import Link from "next/link";
import { KeyRound, ScrollText, Settings2, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { learnerSummary } from "@/lib/services/learning";
import { getPersonCertifications, getPersonBadges } from "@/lib/services/people";
import { queryOne } from "@/lib/db/client";
import { Avatar, Card, CardBody, CardHeader, DescriptionList, KpiTile, PageHeader, Pill, ProgressRing } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { Field, TextInput, Select, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { changePassword, updatePreferences, updateProfile } from "@/lib/actions/account";
import { formatDate, formatDuration, completionTone } from "@/lib/utils";

export const metadata = { title: "My Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const [summary, certifications, badges, prefs] = await Promise.all([
    learnerSummary(user.id),
    getPersonCertifications(user.id),
    getPersonBadges(user.id),
    queryOne<{ theme: string; density: string; email_notifications: boolean; digest_frequency: string }>(
      `select theme, density, email_notifications, digest_frequency from user_preferences where user_id = $1`, [user.id]),
  ]);

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader
        title="My Profile"
        description="Your Academy account, preferences and personal training record."
        actions={<LinkButton href={`/people/${user.id}/transcript`} variant="outline" size="sm"><ScrollText size={15} /> My transcript</LinkButton>}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-col items-center gap-3 text-center">
              <Avatar name={user.fullName} color={user.avatarColor} size={76} />
              <div>
                <p className="text-[17px] font-semibold">{user.fullName}</p>
                <p className="text-[13px] text-[var(--muted)]">{user.positionTitle ?? user.roleName}</p>
              </div>
              <Pill tone="info">{user.roleName}</Pill>
              <ProgressRing value={summary.completion_pct} tone={completionTone(summary.completion_pct)} size={112} sublabel="Required" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Account" icon={<UserRound size={17} />} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Employee ID", value: user.employeeId ?? "—" },
                  { label: "Email", value: user.email },
                  { label: "Username", value: user.username },
                  { label: "Location", value: user.locationName ?? "Corporate" },
                  { label: "Franchise group", value: user.franchiseGroupName ?? "—" },
                  { label: "Department", value: user.departmentName ?? "—" },
                  { label: "Hire date", value: formatDate(user.hireDate) },
                  { label: "Training time", value: formatDuration(summary.training_seconds) },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTile label="Courses completed" value={summary.completed_total} sublabel={`${summary.legacy_records} from the legacy LMS`} tone="success" />
            <KpiTile label="Certifications" value={certifications.filter((c) => c.status !== "expired").length} sublabel={`${summary.expiring_certifications} expiring soon`} tone="info" />
            <KpiTile label="Badges" value={badges.length} sublabel="Achievements earned" tone="accent" href="/achievements" />
          </div>

          <Card>
            <CardHeader title="Personal details" subtitle="Your manager or Corporate Training maintains employment details" />
            <CardBody>
              <form action={updateProfile} className="grid gap-4 sm:grid-cols-2">
                <Field label="Preferred name" hint="How you'd like to be addressed in the Academy">
                  <TextInput name="preferred_name" defaultValue={user.displayName === user.firstName ? "" : user.displayName} placeholder={user.firstName} />
                </Field>
                <Field label="Phone">
                  <TextInput name="phone" type="tel" placeholder="(617) 555-0100" />
                </Field>
                <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save profile</SubmitButton></div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Preferences" icon={<Settings2 size={17} />} />
            <CardBody>
              <form action={updatePreferences} className="grid gap-4 sm:grid-cols-2">
                <Field label="Theme">
                  <Select name="theme" defaultValue={prefs?.theme ?? "system"}>
                    <option value="system">Match my device</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </Select>
                </Field>
                <Field label="Density">
                  <Select name="density" defaultValue={prefs?.density ?? "comfortable"}>
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </Select>
                </Field>
                <Field label="Digest frequency">
                  <Select name="digest_frequency" defaultValue={prefs?.digest_frequency ?? "weekly"}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="never">Never</option>
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Checkbox name="email_notifications" label="Email notifications" defaultChecked={prefs?.email_notifications ?? true}
                    description="Training assignments, due dates and certification reminders" />
                </div>
                <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton></div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Password" icon={<KeyRound size={17} />} />
            <CardBody>
              <form action={changePassword} className="grid gap-4 sm:grid-cols-2">
                <Field label="Current password" required><TextInput name="current_password" type="password" required autoComplete="current-password" /></Field>
                <Field label="New password" required hint="At least 10 characters"><TextInput name="new_password" type="password" required minLength={10} autoComplete="new-password" /></Field>
                <div className="sm:col-span-2"><SubmitButton pendingLabel="Updating…">Update password</SubmitButton></div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
