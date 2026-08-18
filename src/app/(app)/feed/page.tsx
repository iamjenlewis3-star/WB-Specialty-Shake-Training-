import { requireUser, can } from "@/lib/auth/guard";
import { listFeed, listAnnouncements, listComments } from "@/lib/services/feed";
import { filterOptions } from "@/lib/services/people";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { FilterChips } from "@/components/ui/interactive";
import { FeedComposer, FeedPostCard, AnnouncementBanner } from "@/components/feed/feed-ui";

export const metadata = { title: "Academy Feed" };
export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: { searchParams: Promise<{ type?: string; saved?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const [posts, announcements, options] = await Promise.all([
    listFeed(user, { type: sp.type, bookmarked: sp.saved === "1", limit: 40, includeHidden: can(user, "feed.manage") }),
    listAnnouncements(user),
    filterOptions(user.scope),
  ]);
  const comments = await Promise.all(posts.slice(0, 10).map((p) => listComments(p.id)));
  const commentMap = Object.fromEntries(posts.slice(0, 10).map((p, i) => [p.id, comments[i]]));

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <PageHeader
        title="Academy Feed"
        description="Recognition, tips and training updates from across the Wahlburgers system."
      />

      {announcements.filter((a) => a.is_pinned || a.requires_acknowledgment).map((a) => (
        <AnnouncementBanner key={a.id} announcement={a} />
      ))}

      <FeedComposer
        canBroadcast={can(user, ["feed.manage", "announcements.publish"])}
        locations={options.locations.map((l) => ({ value: l.id, label: l.name }))}
        groups={options.groups.map((g) => ({ value: g.id, label: g.name }))}
        regions={options.regions.map((r) => ({ value: r.id, label: r.name }))}
        defaultLocationId={user.locationId}
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <FilterChips paramKey="type" options={[
            { value: "recognition", label: "Recognition" },
            { value: "tip", label: "Tips" },
            { value: "best_practice", label: "Best practice" },
            { value: "new_training", label: "New training" },
            { value: "celebration", label: "Celebrations" },
            { value: "announcement", label: "Announcements" },
          ]} />
          <FilterChips paramKey="saved" options={[{ value: "1", label: "Bookmarked" }]} />
        </CardBody>
      </Card>

      {posts.length === 0 ? (
        <Card><EmptyState title="Nothing in the feed yet" description="Share a win, a tip or a best practice to get things started." /></Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              comments={commentMap[post.id] ?? []}
              canModerate={can(user, ["feed.manage", "feed.moderate"])}
            />
          ))}
        </div>
      )}
    </div>
  );
}
