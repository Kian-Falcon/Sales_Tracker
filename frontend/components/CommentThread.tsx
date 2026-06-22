"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useCreateCommentMutation } from "@/hooks/useStage";
import { listStageMentionableUsers } from "@/lib/api";
import type { Comment, MentionableUser } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const MENTION_RENDER_PATTERN = /(@[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g;
const SINGLE_MENTION_PATTERN = /^@[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export function CommentThread({
  stageId,
  comments,
  canComment
}: {
  stageId: string;
  comments: Comment[];
  canComment: boolean;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number } | null>(null);
  const createComment = useCreateCommentMutation();

  useEffect(() => {
    let active = true;

    if (!canComment) {
      setMentionableUsers([]);
      setMentionError(null);
      return () => {
        active = false;
      };
    }

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
    if (!text.trim()) {
      return;
    }

    await createComment.mutateAsync({ stageId, text: text.trim() });
    setText("");
    router.refresh();
  };

  return (
    <div className="space-y-4 rounded-3xl bg-sand/70 p-4">
      <div className="space-y-3">
        {comments.length ? (
          comments.map((comment) => (
            <article key={comment.id} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{comment.author_name}</div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-pine">
                    {comment.department}
                  </div>
                </div>
                <span className="text-xs text-ink/50">{formatDateTime(comment.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink/80">
                {renderCommentText(comment.text)}
              </p>
            </article>
          ))
        ) : (
          <p className="text-sm text-ink/55">No comments yet for this stage.</p>
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
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
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
                      className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition hover:bg-sand/70"
                    >
                      <div>
                        <div className="text-sm font-medium text-ink">{user.display_name}</div>
                        <div className="text-xs text-ink/55">{user.email}</div>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pine">
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
            {mentionError ? <span className="text-ember">{mentionError}</span> : null}
          </div>
          <button
            type="submit"
            disabled={createComment.isPending}
            className="rounded-full border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
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
        <span key={`${part}-${index}`} className="font-semibold text-pine">
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
