import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { globalSearch } from "@/lib/services/search";
import { Avatar, Card, CardBody, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/interactive";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const results = q && q.trim().length > 1 ? await globalSearch(user, q.trim()) : null;
  const total = results
    ? Object.values(results).reduce((sum, list) => sum + (list as unknown[]).length, 0)
    : 0;

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Search"
        description="Courses, people, resources, locations, learning paths, certifications and announcements — filtered to what you're allowed to see."
      />

      <Card>
        <CardBody><SearchInput placeholder="Search the Academy…" /></CardBody>
      </Card>

      {!results ? (
        <Card><EmptyState icon={<Search size={28} />} title="Start typing to search" description="Try a course name, an employee, a restaurant or a policy." /></Card>
      ) : total === 0 ? (
        <Card><EmptyState title={`No results for "${q}"`} description="Check the spelling or try a broader term." /></Card>
      ) : (
        <div className="space-y-4">
          {results.courses.length > 0 ? (
            <Card>
              <CardHeader title="Courses" subtitle={`${results.courses.length} results`} />
              <CardBody className="space-y-2">
                {results.courses.map((c) => (
                  <Link key={c.id} href={`/library/${c.id}`} className="block rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                    <p className="text-[13.5px] font-semibold">{c.title}</p>
                    <p className="line-clamp-1 text-[12.5px] text-[var(--muted)]">{c.description}</p>
                    {c.category_name ? <Pill tone="neutral" className="mt-1.5">{c.category_name}</Pill> : null}
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {results.people.length > 0 ? (
            <Card>
              <CardHeader title="People" subtitle={`${results.people.length} results`} />
              <CardBody className="space-y-2">
                {results.people.map((p) => (
                  <Link key={p.user_id} href={`/people/${p.user_id}`} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                    <Avatar name={p.full_name} color={p.avatar_color} size={32} />
                    <span>
                      <span className="block text-[13.5px] font-semibold">{p.full_name}</span>
                      <span className="block text-[12px] text-[var(--muted)]">{p.position_title} · {p.location_name}</span>
                    </span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {results.locations.length > 0 ? (
            <Card>
              <CardHeader title="Locations" />
              <CardBody className="grid gap-2 sm:grid-cols-2">
                {results.locations.map((l) => (
                  <Link key={l.id} href={`/locations/${l.id}`} className="rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                    <p className="text-[13.5px] font-semibold">{l.name}</p>
                    <p className="text-[12px] text-[var(--muted)]">#{l.store_number} · {l.city}, {l.state}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {results.resources.length > 0 ? (
            <Card>
              <CardHeader title="Resources" />
              <CardBody className="grid gap-2 sm:grid-cols-2">
                {results.resources.map((r) => (
                  <Link key={r.id} href={`/api/assets/${r.id}/file`} target="_blank" className="rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                    <p className="text-[13.5px] font-semibold">{r.name}</p>
                    <p className="text-[12px] text-[var(--muted)]">{r.category} · {r.asset_type}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {results.paths.length > 0 ? (
            <Card>
              <CardHeader title="Learning paths" />
              <CardBody className="space-y-2">
                {results.paths.map((p) => (
                  <Link key={p.id} href={`/library?path=${p.id}`} className="block rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                    <p className="text-[13.5px] font-semibold">{p.name}</p>
                    <p className="line-clamp-1 text-[12.5px] text-[var(--muted)]">{p.description}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {results.certifications.length > 0 || results.announcements.length > 0 ? (
            <Card>
              <CardHeader title="Certifications & announcements" />
              <CardBody className="space-y-2">
                {results.certifications.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--border)] p-3">
                    <p className="text-[13.5px] font-semibold">{c.name}</p>
                    <p className="text-[12.5px] text-[var(--muted)]">{c.description}</p>
                  </div>
                ))}
                {results.announcements.map((a) => (
                  <Link key={a.id} href="/feed" className="block rounded-lg border border-[var(--border)] p-3 hover:border-[var(--accent)]">
                    <p className="text-[13.5px] font-semibold">{a.title}</p>
                    <p className="line-clamp-2 text-[12.5px] text-[var(--muted)]">{a.message}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
