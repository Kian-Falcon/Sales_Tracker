"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useToast } from "@/components/ToastProvider";
import { useCreateCommentMutation } from "@/hooks/useStage";
import { listStageMentionableUsers } from "@/lib/api";
import type { Comment, Department, MentionableUser } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const MENTION_RENDER_PATTERN = /(@[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g;
const SINGLE_MENTION_PATTERN = /^@[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export function CommentThread({
  stageId,
  comments,
  canComment,
  viewerName,
  viewerDepartment
}: {
  stageId: string;
  comments: Comment[];
  canComment: boolean;
  viewerName?: string | null;
  viewerDepartment?: Department | null;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [localComments, setLocalComments] = useState<Comment[]>(comments);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [postingCommentId, setPostingCommentId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const createComment = useCreateCommentMutation();
  const { pushToast } = useToast();

  useEffect(() => {
    setLocalComments(comments);
  }, [comments]);

  useEffect(() => {
    let active = true;

    if (!canComment) {
      setMentionableUsers([]);
      setMentionLoading(false);
      setMentionError(null);
      return () => {
        active = false;
      };
    }

    setMentionLoading(true);

    void listStageMentionableUsers(stageId)
      .then((users) => {
        if (!active) {
          return;
        }
        setMentionableUsers(users);
        setMentionError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setMentionableUsers([]);
        setMentionError(error instanceof Error ? error.message : "Unable to load teammates for mentions.");
      })
      .finally(() => {
        if (active) {
          setMentionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canComment, stageId]);

  const filteredMentionableUsers = useMemo(() => {
    if (mentionQuery === null) {
      return [];
    }

    const query = mentionQuery.trim().toLowerCase();
    return mentionableUsers
      .filter((user) => {
        if (!query) {
          return true;
        }

        return (
          user.display_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.department.toLowerCase().includes(query)
        );
      })
      .slice(0, 6);
  }, [mentionQuery, mentionableUsers]);

  const updateMentionState = (nextText: string, cursorPosition: number | null) => {
    if (cursorPosition === null || cursorPosition < 0) {
      setMentionQuery(null);
      setMentionRange(null);
      return;
    }

    const beforeCursor = nextText.slice(0, cursorPosition);
    const match = beforeCursor.match(/(^|\s)@([^\s]*)$/);
    if (!match) {
      setMentionQuery(null);
      setMentionRange(null);
      return;
    }

    const query = match[2] ?? "";
    const start = cursorPosition - query.length - 1;
    setMentionQuery(query);
    setMentionRange({ start, end: cursorPosition });
  };

  const handleMentionSelect = (user: MentionableUser) => {
    if (!mentionRange) {
      return;
    }

    const replacement = `@${user.email} `;
    const nextText = `${text.slice(0, mentionRange.start)}${replacement}${text.slice(mentionRange.end)}`;
    const nextCursor = mentionRange.start + replacement.length;

    setText(nextText);
    setMentionQuery(null);
    setMentionRange(null);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText) {
      return;
    }

    const optimisticId = `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticComment: Comment = {
      id: optimisticId,
      stage_id: stageId,
      user_id: "current-user",
      department: viewerDepartment ?? "Admin",
      author_name: viewerName?.trim() || "You",
      text: trimmedText,
      created_at: new Date().toISOString()
    };

    const previousComments = localComments;
    setCommentError(null);
    setPostingCommentId(optimisticId);
    setLocalComments((current) => [...current, optimisticComment]);
    setText("");
    setMentionQuery(null);
    setMentionRange(null);

    try {
      const createdComment = await createComment.mutateAsync({ stageId, text: trimmedText });
      setLocalComments((current) =>
        current.map((comment) => (comment.id === optimisticId ? createdComment : comment))
      );
      setPostingCommentId(null);
      pushToast({
        tone: "success",
        title: "Comment posted",
        description: "The stage update was saved and shared with the team."
      });
      router.refresh();
    } catch (error) {
      setLocalComments(previousComments);
      setPostingCommentId(null);
      setText(trimmedText);
      setCommentError(error instanceof Error ? error.message : "Unable to post this comment right now.");
    }
  };

  return (
    <div className="space-y-4 rounded-3xl bg-surface-muted/70 p-4">
      <div className="space-y-3">
        {localComments.length ? (
          localComments.map((comment) => {
            const isPosting = comment.id === postingCommentId;

            return (
              <article
                key={comment.id}
                className={cn(
                  "rounded-2xl bg-white p-3 shadow-sm transition",
                  isPosting && "border border-accent/15 bg-accent/5"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink">{comment.author_name}</div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
                      {comment.department}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-ink/50">{formatDateTime(comment.created_at)}</span>
                    {isPosting ? (
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                        Posting...
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">{renderCommentText(comment.text)}</p>
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-white/70 px-4 py-4 text-sm text-ink/55">
            No comments yet for this stage. Use comments to leave a locked update for the next handoff.
          </div>
        )}
      </div>

      {canComment ? (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => {
                const nextText = event.target.value;
                setText(nextText);
                updateMentionState(nextText, event.target.selectionStart);
              }}
              onClick={(event) => {
                updateMentionState(text, event.currentTarget.selectionStart);
              }}
              onKeyUp={(event) => {
                updateMentionState(text, event.currentTarget.selectionStart);
              }}
              rows={3}
              maxLength={1000}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-accent"
              placeholder="Add a locked stage update..."
            />

            {mentionQuery !== null && filteredMentionableUsers.length ? (
              <div className="rounded-2xl border border-ink/10 bg-white p-2 shadow-sm">
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                  Mention teammate
                </p>
                <div className="space-y-1">
                  {filteredMentionableUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleMentionSelect(user);
                      }}
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition hover:bg-surface-muted/70"
                    >
                      <div>
                        <div className="text-sm font-medium text-ink">{user.display_name}</div>
                        <div className="text-xs text-ink/55">{user.email}</div>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                        {user.department}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-ink/50">
            <span>Type `@` to mention a teammate. Mentions send an email notification.</span>
            {mentionLoading ? <span className="text-ink/45">Loading teammates...</span> : null}
            {mentionError ? <span className="text-danger">{mentionError}</span> : null}
          </div>

          {commentError ? (
            <p className="rounded-2xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
              {commentError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={createComment.isPending || !text.trim()}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {createComment.isPending ? "Posting..." : "Post comment"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-ink/45">Comments lock once a stage is no longer active.</p>
      )}
    </div>
  );
}

function renderCommentText(text: string) {
  return text.split(MENTION_RENDER_PATTERN).map((part, index) => {
    if (SINGLE_MENTION_PATTERN.test(part)) {
      return (
        <span key={`${part}-${index}`} className="font-semibold text-ink">
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
