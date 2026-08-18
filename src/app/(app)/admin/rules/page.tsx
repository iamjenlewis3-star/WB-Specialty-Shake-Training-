import { Play, Repeat } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { listAutomationRules } from "@/lib/services/assignments";
import { listCatalog, listLearningPaths } from "@/lib/services/courses";
import { filterOptions } from "@/lib/services/people";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { Field, Select, TextInput, TextArea, SubmitButton } from "@/components/ui/interactive";
import { createAutomationRule, runRuleNow, toggleRule } from "@/lib/actions/assignments";
import { formatRelative } from "@/lib/utils";

export const metadata = { title: "Automated assignments" };
export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const user = await requirePermission("rules.manage");
  const [rules, catalog, paths, options] = await Promise.all([
    listAutomationRules(),
    listCatalog(user.id, { pageSize: 60 }),
    listLearningPaths(),
    filterOptions(user.scope),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automated assignments"
        description="Rules that assign training automatically — on hire, on transfer, by role, by department or by restaurant."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Automation rules" }]}
      />

      <Card>
        <CardHeader title="Create a rule" icon={<Repeat size={17} />} subtitle="IF the condition matches, THEN the Academy assigns the training" />
        <CardBody>
          <form action={createAutomationRule} className="grid gap-4 sm:grid-cols-3">
            <Field label="Rule name" required className="sm:col-span-2">
              <TextInput name="name" required placeholder="e.g. Role = Cook → Cook Certification" />
            </Field>
            <Field label="Trigger" required>
              <Select name="trigger_event" required defaultValue="on_create">
                <option value="on_create">When an employee is created</option>
                <option value="on_transfer">When an employee transfers</option>
                <option value="on_role_change">When a role changes</option>
                <option value="nightly">Nightly sweep</option>
              </Select>
            </Field>
            <Field label="IF field" required>
              <Select name="condition_field" required defaultValue="role_code">
                <option value="role_code">Role</option>
                <option value="position_title">Position title</option>
                <option value="department_code">Department</option>
                <option value="location_id">Location</option>
                <option value="is_new_hire">New hire</option>
              </Select>
            </Field>
            <Field label="Operator" required>
              <Select name="condition_op" required defaultValue="eq">
                <option value="eq">equals</option>
                <option value="in">is one of (comma separated)</option>
                <option value="neq">does not equal</option>
              </Select>
            </Field>
            <Field label="Value" required hint="e.g. Cook, gm, BOH, true">
              <TextInput name="condition_value" required placeholder="Cook" />
            </Field>
            <Field label="THEN assign" required>
              <Select name="action_type" required defaultValue="course">
                <option value="course">Course</option>
                <option value="learning_path">Learning path</option>
              </Select>
            </Field>
            <Field label="Training" required className="sm:col-span-1">
              <Select name="action_id" required defaultValue="">
                <option value="">Select…</option>
                <optgroup label="Courses">
                  {catalog.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
                <optgroup label="Learning paths">
                  {paths.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              </Select>
            </Field>
            <Field label="Due in (days)"><TextInput name="due_in_days" type="number" min={1} max={365} defaultValue={30} /></Field>
            <Field label="Description" className="sm:col-span-3"><TextArea name="description" rows={2} /></Field>
            <div className="sm:col-span-3"><SubmitButton pendingLabel="Creating…">Create rule</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Rules" subtitle={`${rules.length} configured`} />
        {rules.length === 0 ? (
          <EmptyState title="No automation rules yet" />
        ) : (
          <TableWrap>
            <Table className="min-w-[860px]">
              <thead>
                <tr><Th>Rule</Th><Th>Trigger</Th><Th>Condition</Th><Th>Assigns</Th><Th>Matches</Th><Th>Last run</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const condition = rule.conditions?.all?.[0];
                  return (
                    <Tr key={rule.id}>
                      <Td>
                        <span className="font-medium">{rule.name}</span>
                        <span className="block text-[11.5px] text-[var(--muted)]">{rule.description}</span>
                      </Td>
                      <Td className="capitalize text-[var(--muted)]">{rule.trigger_event.replace(/_/g, " ")}</Td>
                      <Td className="font-mono text-[11.5px] text-[var(--muted)]">
                        {condition ? `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}` : "—"}
                      </Td>
                      <Td>{rule.target_label ?? "—"}</Td>
                      <Td className="tabular-nums">{rule.matches_count}</Td>
                      <Td className="whitespace-nowrap text-[var(--muted)]">{rule.last_run_at ? formatRelative(rule.last_run_at) : "Never"}</Td>
                      <Td><Pill tone={rule.is_active ? "success" : "neutral"}>{rule.is_active ? "Active" : "Paused"}</Pill></Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5">
                          <form action={runRuleNow}>
                            <input type="hidden" name="rule_id" value={rule.id} />
                            <SubmitButton variant="outline" size="sm" pendingLabel="Running…"><Play size={13} /> Run now</SubmitButton>
                          </form>
                          <form action={toggleRule}>
                            <input type="hidden" name="rule_id" value={rule.id} />
                            <SubmitButton variant="ghost" size="sm" pendingLabel="…">{rule.is_active ? "Pause" : "Resume"}</SubmitButton>
                          </form>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
