import { AlertTriangle, Gauge, Palette, Play, Trophy, UserMinus } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { getSetting, DEFAULT_INACTIVITY, DEFAULT_THRESHOLDS, type InactivityRules, type RiskThresholds } from "@/lib/services/settings";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, KpiTile, PageHeader } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/utils";
import { Field, TextInput, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { runAutomations, saveBranding, saveInactivityRules, saveLeaderboardScoring, saveThresholds } from "@/lib/actions/settings";
import { runInactivitySweep } from "@/lib/actions/people";
import { lastAutomationRun } from "@/lib/services/automation";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const [inactivity, thresholds, weights, scoring, branding, newHire, counts, lastRun] = await Promise.all([
    getSetting<InactivityRules>("inactivity_rules", DEFAULT_INACTIVITY),
    getSetting<RiskThresholds>("risk_thresholds", DEFAULT_THRESHOLDS),
    getSetting("health_score_weights", { requiredCompletion: 40, overdue: 25, certification: 20, activity: 10, newHire: 5 }),
    getSetting("leaderboard_scoring", { requiredCompletion: 50, learningPaths: 20, certifications: 15, achievements: 10, engagement: 5, rewardTimeSpent: false }),
    getSetting("branding", { productName: "Wahlburgers Academy", primaryColor: "#0e1f38", accentColor: "#c8102e", supportEmail: "academy@wahlburgers.test" }),
    getSetting("new_hire_window_days", { days: 60 }),
    query<{ flagged: string; inactive: string; deactivated: string }>(`
      select (select count(*)::text from users where flagged_inactive_at is not null) as flagged,
             (select count(*)::text from users where status = 'active' and (last_login_at is null or last_login_at < now() - interval '30 days')) as inactive,
             (select count(*)::text from users where status = 'deactivated') as deactivated`),
    lastAutomationRun(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="System configuration — inactivity rules, risk thresholds, the training health score, leaderboard scoring and branding."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Flagged inactive" value={Number(counts[0]?.flagged ?? 0).toLocaleString()} sublabel="By the inactivity rule" tone="warning" icon={<AlertTriangle size={16} />} />
        <KpiTile label="No sign-in 30+ days" value={Number(counts[0]?.inactive ?? 0).toLocaleString()} sublabel="Active accounts" tone="info" icon={<UserMinus size={16} />} />
        <KpiTile label="Deactivated accounts" value={Number(counts[0]?.deactivated ?? 0).toLocaleString()} sublabel="Training history preserved" tone="neutral" />
      </div>

      <Card>
        <CardHeader
          title="Scheduled maintenance"
          subtitle={lastRun ? `Last run ${formatRelative(lastRun)}` : "Never run in this environment"}
          icon={<Play size={17} />}
        />
        <CardBody className="space-y-3">
          <p className="text-[13.5px] text-[var(--muted)]">
            One job does everything a nightly worker would: certification expiry reminders at the configured
            intervals, due-soon and overdue nudges, the next cycle of recurring assignments, publishing course
            versions that were scheduled, evaluating automation rules and running the inactivity sweep.
            In production this is called on a schedule; here you can run it on demand.
          </p>
          <form action={runAutomations}>
            <SubmitButton pendingLabel="Running automations…"><Play size={15} /> Run daily automations now</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Automatic deactivation" subtitle="Flag, notify and optionally deactivate accounts that stop signing in" icon={<UserMinus size={17} />} />
        <CardBody>
          <form action={saveInactivityRules} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Checkbox name="enabled" label="Enable inactivity rules" defaultChecked={inactivity.enabled} />
              <Checkbox name="notify_manager" label="Notify the employee's manager when flagged" defaultChecked={inactivity.notifyManager} />
              <Checkbox name="notify_admin" label="Notify administrators when flagged" defaultChecked={inactivity.notifyAdmin} />
              <Checkbox name="auto_deactivate" label="Automatically deactivate after the threshold" defaultChecked={inactivity.autoDeactivate}
                description="Deactivation never deletes training records — managers can reactivate at any time" />
            </div>
            <Field label="Flag after (days without login)"><TextInput name="flag_after_days" type="number" min={1} max={365} defaultValue={inactivity.flagAfterDays} /></Field>
            <Field label="Auto-deactivate after (days)"><TextInput name="auto_deactivate_after_days" type="number" min={1} max={730} defaultValue={inactivity.autoDeactivateAfterDays} /></Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save inactivity rules</SubmitButton>
            </div>
          </form>
          <form action={runInactivitySweep} className="mt-3">
            <SubmitButton variant="outline" size="sm" pendingLabel="Running sweep…"><Play size={14} /> Run the inactivity sweep now</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Risk thresholds & training health score" subtitle="Used by dashboards, the Command Center and location reports" icon={<Gauge size={17} />} />
        <CardBody>
          <form action={saveThresholds} className="grid gap-4 sm:grid-cols-3">
            <Field label="Green at or above (%)"><TextInput name="green" type="number" min={0} max={100} defaultValue={thresholds.green} /></Field>
            <Field label="Yellow at or above (%)"><TextInput name="yellow" type="number" min={0} max={100} defaultValue={thresholds.yellow} /></Field>
            <div />
            <Field label="Weight: required completion"><TextInput name="w_completion" type="number" min={0} max={100} defaultValue={weights.requiredCompletion} /></Field>
            <Field label="Weight: overdue"><TextInput name="w_overdue" type="number" min={0} max={100} defaultValue={weights.overdue} /></Field>
            <Field label="Weight: certification"><TextInput name="w_certification" type="number" min={0} max={100} defaultValue={weights.certification} /></Field>
            <Field label="Weight: activity"><TextInput name="w_activity" type="number" min={0} max={100} defaultValue={weights.activity} /></Field>
            <Field label="Weight: new hire progress"><TextInput name="w_new_hire" type="number" min={0} max={100} defaultValue={weights.newHire} /></Field>
            <div className="sm:col-span-3"><SubmitButton pendingLabel="Saving…">Save thresholds and weights</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Leaderboard scoring" subtitle="What the Academy rewards" icon={<Trophy size={17} />} />
        <CardBody>
          <form action={saveLeaderboardScoring} className="grid gap-4 sm:grid-cols-3">
            <Field label="Required completion weight"><TextInput name="required_completion" type="number" min={0} max={100} defaultValue={scoring.requiredCompletion} /></Field>
            <Field label="Learning path weight"><TextInput name="learning_paths" type="number" min={0} max={100} defaultValue={scoring.learningPaths} /></Field>
            <Field label="Certification weight"><TextInput name="certifications" type="number" min={0} max={100} defaultValue={scoring.certifications} /></Field>
            <Field label="Achievement weight"><TextInput name="achievements" type="number" min={0} max={100} defaultValue={scoring.achievements} /></Field>
            <Field label="Engagement weight"><TextInput name="engagement" type="number" min={0} max={100} defaultValue={scoring.engagement} /></Field>
            <div className="flex items-end">
              <Checkbox name="reward_time_spent" label="Reward time spent in courses" defaultChecked={scoring.rewardTimeSpent}
                description="Off by default — the Academy rewards completion and mastery, not seat time" />
            </div>
            <div className="sm:col-span-3"><SubmitButton pendingLabel="Saving…">Save leaderboard scoring</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Branding & general" icon={<Palette size={17} />} />
        <CardBody>
          <form action={saveBranding} className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name"><TextInput name="product_name" defaultValue={branding.productName} /></Field>
            <Field label="Support email"><TextInput name="support_email" type="email" defaultValue={branding.supportEmail} /></Field>
            <Field label="Primary color"><TextInput name="primary_color" type="color" defaultValue={branding.primaryColor} className="h-9 p-1" /></Field>
            <Field label="Accent color"><TextInput name="accent_color" type="color" defaultValue={branding.accentColor} className="h-9 p-1" /></Field>
            <Field label="New hire window (days)" hint="How long an employee counts as a new hire for assignments and reporting">
              <TextInput name="new_hire_days" type="number" min={7} max={365} defaultValue={newHire.days} />
            </Field>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save branding</SubmitButton></div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
