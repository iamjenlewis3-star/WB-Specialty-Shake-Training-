import { FolderOpen, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/guard";
import { assetCategories, listAssets } from "@/lib/services/assets";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill, Table, TableWrap, Td, Th, Tr } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput, Field, Select, TextInput, TextArea, Checkbox, SubmitButton } from "@/components/ui/interactive";
import { archiveAsset, uploadAsset } from "@/lib/actions/content";
import { formatDate, formatFileSize } from "@/lib/utils";

export const metadata = { title: "Asset Library" };
export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; type?: string; category?: string; archived?: string }> }) {
  const user = await requirePermission("assets.manage");
  const sp = await searchParams;
  const [assets, categories] = await Promise.all([
    listAssets({ q: sp.q, type: sp.type, category: sp.category, includeArchived: sp.archived === "1", userId: user.id }),
    assetCategories(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asset Library"
        description="Every training asset Wahlburgers owns — SCORM archives, video, PDFs, presentations, policies and job aids — with versions and reuse across courses."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Asset Library" }]}
      />

      <Card>
        <CardHeader title="Add an asset" icon={<Upload size={17} />} subtitle="Files up to 250 MB · type and extension validated on upload" />
        <CardBody>
          <form action={uploadAsset} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
            <Field label="Asset name" required><TextInput name="name" required placeholder="e.g. Specialty Shake Build Sheets" /></Field>
            <Field label="Type" required>
              <Select name="asset_type" required defaultValue="pdf">
                {["pdf", "video", "document", "presentation", "image", "html", "link", "checklist", "policy", "sop", "job_aid", "guide"].map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category"><TextInput name="category" list="asset-categories" placeholder="Position Guides" /></Field>
            <datalist id="asset-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Tags" hint="Comma separated"><TextInput name="tags" placeholder="boh, grill, standards" /></Field>
            <Field label="Description" className="sm:col-span-2"><TextArea name="description" rows={2} /></Field>
            <Field label="File"><input type="file" name="file" className="block w-full text-[13px]" /></Field>
            <Field label="External URL" hint="Use instead of a file for linked resources"><TextInput name="external_url" type="url" /></Field>
            <div className="space-y-1 sm:col-span-2">
              <Checkbox name="is_resource" label="Publish to the Resource Library" description="Makes it browsable to every employee without an assignment" />
              <Checkbox name="requires_acknowledgment" label="Requires acknowledgment" description="Captures name, version and timestamp when reviewed" />
            </div>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Uploading…">Add asset</SubmitButton></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search assets…" className="w-full sm:w-72" />
          <FilterSelect paramKey="category" label="Category" allLabel="All categories" options={categories.map((c) => ({ value: c, label: c }))} />
          <FilterSelect paramKey="type" label="Type" allLabel="All types" options={["pdf", "video", "document", "presentation", "policy", "checklist", "job_aid"].map((t) => ({ value: t, label: t.replace("_", " ") }))} />
          <FilterSelect paramKey="archived" label="Archived" allLabel="Active only" options={[{ value: "1", label: "Include archived" }]} />
          <ClearFilters keys={["q", "category", "type", "archived"]} />
          <Pill tone="neutral" className="ml-auto">{assets.length} assets</Pill>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Assets" icon={<FolderOpen size={17} />} />
        {assets.length === 0 ? (
          <EmptyState title="No assets match those filters" />
        ) : (
          <TableWrap>
            <Table className="min-w-[900px]">
              <thead>
                <tr><Th>Asset</Th><Th>Type</Th><Th>Category</Th><Th>Version</Th><Th>Size</Th><Th>Used by</Th><Th>Uploaded by</Th><Th>Updated</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-[11.5px] text-[var(--muted)]">{a.file_name ?? "No file stored"}</span>
                    </Td>
                    <Td className="capitalize text-[var(--muted)]">{a.asset_type.replace("_", " ")}</Td>
                    <Td className="text-[var(--muted)]">{a.category ?? "—"}</Td>
                    <Td className="tabular-nums">v{a.version}</Td>
                    <Td className="whitespace-nowrap">{formatFileSize(a.file_size)}</Td>
                    <Td className="tabular-nums">{a.course_count} courses</Td>
                    <Td className="text-[var(--muted)]">{a.uploaded_by_name ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-[var(--muted)]">{formatDate(a.updated_at)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Pill tone={a.status === "active" ? "success" : "neutral"}>{a.status}</Pill>
                        {a.is_resource ? <Pill tone="info">Resource</Pill> : null}
                        {a.requires_acknowledgment ? <Pill tone="warning">Ack</Pill> : null}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <LinkButton href={`/api/assets/${a.id}/file`} target="_blank" variant="outline" size="sm">Preview</LinkButton>
                        <form action={archiveAsset}>
                          <input type="hidden" name="asset_id" value={a.id} />
                          <SubmitButton variant="ghost" size="sm" pendingLabel="…">{a.status === "archived" ? "Restore" : "Archive"}</SubmitButton>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
