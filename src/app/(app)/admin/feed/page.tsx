import { requireUser, requirePermission, can } from "@/lib/auth/guard";
import { listFeed, listComments } from "@/lib/services/feed";
import { query } from "@/lib/db/client";
import { Card, CardBody, CardHeader, KpiTile, PageHeader } from "@/components/ui/primitives";
import { FeedPostCard } from "@/components/feed/feed-ui";

export const metadata = { title: "Academy Feed moderation" };
export const dynamic = "force-dynamic";

export default async function FeedModerationPage() {
  const user = await requirePermission("feed.manage");
  const [posts, stats] = await Promise.all([
    listFeed(user, { limit: 40, includeHidden: true }),
    query<{ posts: string; comments: string; reactions: string; hidden: string }>(`
      select (select count(*)::text from social_posts) as posts,
             (select count(*)::text from social_comments) as comments,
             (select count(*)::text from social_reactions) as reactions,
             (select count(*)::text from social_posts where status = 'hidden') as hidden`),
  ]);
  const comments = await Promise.all(posts.slice(0, 15).map((p) => listComments(p.id)));
  const commentMap = Object.fromEntries(posts.slice(0, 15).map((p, i) => [p.id, comments[i]]));

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <PageHeader
        title="Academy Feed moderation"
        description="Pin, hide and moderate posts and comments across the system."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Academy Feed" }]}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Posts" value={Number(stats[0]?.posts ?? 0).toLocaleString()} tone="info" />
        <KpiTile label="Comments" value={Number(stats[0]?.comments ?? 0).toLocaleString()} tone="neutral" />
        <KpiTile label="Reactions" value={Number(stats[0]?.reactions ?? 0).toLocaleString()} tone="accent" />
        <KpiTile label="Hidden posts" value={Number(stats[0]?.hidden ?? 0).toLocaleString()} tone="warning" />
      </div>
      <div className="space-y-4">
        {posts.map((post) => (
          <FeedPostCard key={post.id} post={post} comments={commentMap[post.id] ?? []} canModerate />
        ))}
      </div>
    </div>
  );
}
