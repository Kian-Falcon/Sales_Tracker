"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useCreateCommentMutation } from "@/hooks/useStage";
import type { Comment } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

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
  const [text, setText] = useState("");
  const createComment = useCreateCommentMutation();

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
              <p className="mt-2 text-sm text-ink/80">{comment.text}</p>
            </article>
          ))
        ) : (
          <p className="text-sm text-ink/55">No comments yet for this stage.</p>
        )}
      </div>

      {canComment ? (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
            placeholder="Add a locked stage update..."
          />
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
