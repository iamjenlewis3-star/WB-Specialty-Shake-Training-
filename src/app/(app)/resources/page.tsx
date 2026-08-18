import Link from "next/link";
import { Download, FileText, FolderOpen, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { assetCategories, listAssets } from "@/lib/services/assets";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { ClearFilters, FilterSelect, SearchInput, SubmitButton } from "@/components/ui/interactive";
import { acknowledgeDocument } from "@/lib/actions/learning";
import { formatDate, formatFileSize } from "@/lib/utils";

export const metadata = { title: "Resources" };
export const dynamic = "force-dynamic";

export default async function ResourcesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; type?: string; category?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [assets, categories] = await Promise.all([
    listAssets({ q: sp.q, type: sp.type, category: sp.category, resourcesOnly: true, userId: user.id }),
    assetCategories(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Resources"
        description="SOPs, position guides, recipe cards, brand standards and job aids — reference material you can use on shift without an assignment."
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search resources…" className="w-full sm:w-72" />
          <FilterSelect paramKey="category" label="Category" allLabel="All categories" options={categories.map((c) => ({ value: c, label: c }))} />
          <FilterSelect paramKey="type" label="Format" allLabel="All formats" options={[
            { value: "pdf", label: "PDF" }, { value: "document", label: "Document" }, { value: "presentation", label: "Presentation" },
            { value: "checklist", label: "Checklist" }, { value: "policy", label: "Policy" }, { value: "job_aid", label: "Job aid" },
          ]} />
          <ClearFilters keys={["q", "type", "category"]} />
          <Pill tone="neutral" className="ml-auto">{assets.length} resources</Pill>
        </CardBody>
      </Card>

      {assets.length === 0 ? (
        <Card><EmptyState title="No resources match those filters" icon={<FolderOpen size={28} />} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset.id} className="flex h-full flex-col">
              <CardBody className="flex flex-1 flex-col">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[var(--muted)]">
                    <FileText size={18} />
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone="neutral">{asset.asset_type.replace("_", " ")}</Pill>
                    {asset.requires_acknowledgment ? <Pill tone="warning">Acknowledge</Pill> : null}
                  </div>
                </div>
                <h3 className="text-[14.5px] font-semibold">{asset.name}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-[12.5px] text-[var(--muted)]">{asset.description}</p>
                <p className="mt-2 text-[11.5px] text-[var(--muted-2)]">
                  {asset.category} · v{asset.version} · {formatFileSize(asset.file_size)} · updated {formatDate(asset.updated_at)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <LinkButton href={`/api/assets/${asset.id}/file`} target="_blank" variant="outline" size="sm">
                    Preview
                  </LinkButton>
                  <a href={`/api/assets/${asset.id}/file`} download className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-3)]">
                    <Download size={14} /> Download
                  </a>
                  {asset.requires_acknowledgment ? (
                    asset.acknowledged ? (
                      <Pill tone="success" dot>Acknowledged</Pill>
                    ) : (
                      <form action={acknowledgeDocument}>
                        <input type="hidden" name="entityId" value={asset.id} />
                        <input type="hidden" name="entityType" value="asset" />
                        <input type="hidden" name="statement" value="I have reviewed and understand this policy." />
                        <SubmitButton size="sm" variant="accent" pendingLabel="Recording…"><ShieldCheck size={14} /> Acknowledge</SubmitButton>
                      </form>
                    )
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
