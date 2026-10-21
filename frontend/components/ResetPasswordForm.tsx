"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { AuthPasswordField } from "@/components/AuthPasswordField";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function ResetPasswordForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();

    void (async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (active) {
        setHasRecoverySession(Boolean(session));
      }
    })();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setHasRecoverySession(Boolean(session));
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (hasRecoverySession === false) {
      setError("This reset link is missing or expired. Request a fresh password reset email.");
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const { error: updateError } = await supabase.auth.updateUser({
            password
          });

          if (updateError) {
            throw updateError;
          }

          setMessage("Password updated. Redirecting to your dashboard...");
          router.push("/dashboard");
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to update your password.");
        }
      })();
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink/70">
        {hasRecoverySession === null
          ? "Checking your reset link..."
          : hasRecoverySession === false
            ? "Open the latest password reset link from your email to set a new password."
            : "Choose a new password for your workflow tracker account."}
      </div>

      <AuthPasswordField
        id="resetPassword"
        label="New password"
        value={password}
        onChange={setPassword}
        placeholder="Create a new password"
        autoComplete="new-password"
      />

      <AuthPasswordField
        id="resetPasswordConfirm"
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Re-enter your new password"
        autoComplete="new-password"
      />

      {message ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{message}</p> : null}
      {error ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || hasRecoverySession !== true}
        className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Updating password..." : hasRecoverySession === null ? "Checking link..." : "Set new password"}
      </button>

      <p className="text-center text-sm text-ink/60">
        Need a new link?{" "}
        <Link href="/forgot-password" className="font-semibold text-accent transition hover:text-ink">
          Request password reset
        </Link>
      </p>
    </form>
  );
}
