"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, EyeOff, Heart, MessageSquare, PartyPopper, Pin, Send, ThumbsUp } from "lucide-react";
import { Avatar, Card, CardBody, Pill } from "@/components/ui/primitives";
import { Select, TextArea, SubmitButton, TextInput } from "@/components/ui/interactive";
import { buttonClass } from "@/components/ui/button";
import { addComment, createPost, moderateComment, moderatePost, reactToPost, toggleBookmark, acknowledgeAnnouncement } from "@/lib/actions/feed";
import { cn, formatRelative } from "@/lib/utils";
import type { FeedPost } from "@/lib/services/feed";

type Option = { value: string; label: string };

export function FeedComposer({
  canBroadcast, locations, groups, regions, defaultLocationId,
}: { canBroadcast: boolean; locations: Option[]; groups: Option[]; regions: Option[]; defaultLocationId: string | null }) {
  const [audienceType, setAudienceType] = React.useState(canBroadcast ? "organization" : "location");
  const audienceOptions = audienceType === "location" ? locations : audienceType === "franchise_group" ? groups : audienceType === "region" ? regions : [];

  return (
    <Card>
      <CardBody>
        <form action={createPost} className="space-y-3">
          <TextArea name="body" rows={3} placeholder="Share a win, a tip or a best practice with the system…" required />
          <div className="grid gap-2 sm:grid-cols-4">
            <TextInput name="title" placeholder="Optional headline" />
            <Select name="post_type" defaultValue="tip">
              <option value="tip">Tip</option>
              <option value="recognition">Recognition</option>
              <option value="best_practice">Best practice</option>
              <option value="celebration">Celebration</option>
              <option value="photo">Photo</option>
              <option value="training_update">Training update</option>
              {canBroadcast ? <option value="announcement">Announcement</option> : null}
              {canBroadcast ? <option value="new_training">New training</option> : null}
            </Select>
            <Select name="audience_type" value={audienceType} onChange={(e) => setAudienceType(e.target.value)}>
              {canBroadcast ? <option value="organization">Entire organization</option> : null}
              <option value="location">My restaurant</option>
              <option value="franchise_group">Franchise group</option>
              <option value="region">Region</option>
            </Select>
            {audienceOptions.length > 0 ? (
              <Select name="audience_id" defaultValue={audienceType === "location" ? defaultLocationId ?? "" : ""}>
                <option value="">Select audience…</option>
                {audienceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : <div />}
          </div>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Posting…"><Send size={15} /> Post to the feed</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function AnnouncementBanner({
  announcement,
}: {
  announcement: {
    id: string; title: string; message: string; link_url: string | null; requires_acknowledgment: boolean;
    acknowledged: boolean; ack_count: string; publish_at: string;
  };
}) {
  return (
    <Card className="border-[var(--accent)]">
      <CardBody className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">Announcement</Pill>
          <span className="text-[11.5px] text-[var(--muted)]">{formatRelative(announcement.publish_at)}</span>
          {announcement.requires_acknowledgment ? <Pill tone="warning">Acknowledgment required</Pill> : null}
        </div>
        <h3 className="text-[16px] font-semibold">{announcement.title}</h3>
        <p className="text-[13.5px] text-[var(--muted)]">{announcement.message}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {announcement.link_url ? (
            <Link href={announcement.link_url} className="text-[13px] font-medium text-[var(--accent)] hover:underline">Open</Link>
          ) : null}
          {announcement.requires_acknowledgment ? (
            announcement.acknowledged ? (
              <Pill tone="success" dot>Acknowledged</Pill>
            ) : (
              <form action={acknowledgeAnnouncement}>
                <input type="hidden" name="announcement_id" value={announcement.id} />
                <SubmitButton size="sm" pendingLabel="Recording…">I have read and understand this</SubmitButton>
              </form>
            )
          ) : null}
          <span className="text-[12px] text-[var(--muted-2)]">{announcement.ack_count} acknowledgments</span>
        </div>
      </CardBody>
    </Card>
  );
}

export function FeedPostCard({
  post, comments, canModerate,
}: {
  post: FeedPost;
  comments: Array<{ id: string; body: string; created_at: string; author_name: string | null; author_color: string | null }>;
  canModerate: boolean;
}) {
  const [showComments, setShowComments] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const react = (type: "like" | "celebrate" | "helpful") => startTransition(() => reactToPost(post.id, type));

  return (
    <Card className={cn(post.is_pinned && "border-[var(--accent)]", post.status === "hidden" && "opacity-60")}>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={post.author_name ?? "Wahlburgers Academy"} color={post.author_color} size={38} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">{post.author_name ?? "Wahlburgers Academy"}</p>
              <p className="text-[11.5px] text-[var(--muted)]">
                {post.author_role}{post.author_location ? ` · ${post.author_location}` : ""} · {formatRelative(post.created_at)}
                {post.audience_label ? ` · to ${post.audience_label}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {post.is_pinned ? <Pill tone="accent">Pinned</Pill> : null}
            <Pill tone="neutral">{post.post_type.replace(/_/g, " ")}</Pill>
          </div>
        </div>

        {post.title ? <h3 className="text-[15.5px] font-semibold">{post.title}</h3> : null}
        <p className="whitespace-pre-line text-[14px] leading-relaxed">{post.body}</p>
        {post.link_url ? (
          <Link href={post.link_url} className="inline-block text-[13px] font-medium text-[var(--accent)] hover:underline">Open link</Link>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 border-t border-[var(--border)] pt-2.5">
          <button onClick={() => react("like")} disabled={pending}
            className={cn(buttonClass("ghost", "sm"), post.my_reaction === "like" && "text-[var(--accent)]")}>
            <ThumbsUp size={15} /> {post.likes}
          </button>
          <button onClick={() => react("celebrate")} disabled={pending}
            className={cn(buttonClass("ghost", "sm"), post.my_reaction === "celebrate" && "text-[var(--accent)]")}>
            <PartyPopper size={15} /> {post.celebrates}
          </button>
          <button onClick={() => react("helpful")} disabled={pending}
            className={cn(buttonClass("ghost", "sm"), post.my_reaction === "helpful" && "text-[var(--accent)]")}>
            <Heart size={15} /> {post.helpfuls}
          </button>
          <button onClick={() => setShowComments((s) => !s)} className={buttonClass("ghost", "sm")}>
            <MessageSquare size={15} /> {post.comment_count}
          </button>
          <button onClick={() => startTransition(() => toggleBookmark(post.id))} disabled={pending}
            className={cn(buttonClass("ghost", "sm"), post.bookmarked && "text-[var(--accent)]")}>
            <Bookmark size={15} fill={post.bookmarked ? "currentColor" : "none"} />
          </button>
          {canModerate ? (
            <span className="ml-auto flex items-center gap-1">
              <form action={moderatePost}>
                <input type="hidden" name="post_id" value={post.id} />
                <input type="hidden" name="moderation" value="pin" />
                <SubmitButton variant="ghost" size="sm" pendingLabel="…"><Pin size={14} /></SubmitButton>
              </form>
              <form action={moderatePost}>
                <input type="hidden" name="post_id" value={post.id} />
                <input type="hidden" name="moderation" value="hide" />
                <SubmitButton variant="ghost" size="sm" pendingLabel="…"><EyeOff size={14} /></SubmitButton>
              </form>
            </span>
          ) : null}
        </div>

        {showComments ? (
          <div className="space-y-3 border-t border-[var(--border)] pt-3">
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar name={c.author_name ?? "Team member"} color={c.author_color} size={28} />
                <div className="min-w-0 flex-1 rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[12.5px] font-semibold">{c.author_name} <span className="font-normal text-[var(--muted)]">· {formatRelative(c.created_at)}</span></p>
                  <p className="text-[13px]">{c.body}</p>
                </div>
                {canModerate ? (
                  <form action={moderateComment}>
                    <input type="hidden" name="comment_id" value={c.id} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="…"><EyeOff size={13} /></SubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
            <form action={addComment} className="flex items-center gap-2">
              <input type="hidden" name="post_id" value={post.id} />
              <input
                name="body" required placeholder="Add a comment…"
                className="h-9 flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13.5px]"
              />
              <SubmitButton size="sm" pendingLabel="…"><Send size={14} /></SubmitButton>
            </form>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
