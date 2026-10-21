"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { getAuthCallbackUrl } from "@/lib/site-url";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const redirectTo = getAuthCallbackUrl("/reset-password");
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
            redirectTo
          });

          if (resetError) {
            throw resetError;
          }

          setMessage("If that email exists in the tracker, a password reset link has been sent to the inbox.");
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to send the reset link right now.");
        }
      })();
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="forgotPasswordEmail">
          Work email
        </label>
        <input
          id="forgotPasswordEmail"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-accent"
          placeholder="sales@kianfalcon.com"
        />
      </div>

      {message ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{message}</p> : null}
      {error ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Sending reset link..." : "Send reset link"}
      </button>

      <p className="text-center text-sm text-ink/60">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-accent transition hover:text-ink">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
