"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { AuthPasswordField } from "@/components/AuthPasswordField";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError) {
            throw signInError;
          }

          router.push("/dashboard");
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
        }
      })();
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
          placeholder="sales@kianfalcon.com"
        />
      </div>

      <AuthPasswordField
        id="password"
        label="Password"
        value={password}
        onChange={setPassword}
        placeholder="Enter your password"
      />

      {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-sm text-ink/60">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-pine transition hover:text-ink">
          Create an account
        </Link>
      </p>
    </form>
  );
}
