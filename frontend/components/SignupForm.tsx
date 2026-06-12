"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { AuthPasswordField } from "@/components/AuthPasswordField";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Department } from "@/lib/types";

const departments: Department[] = ["Sales", "R&D", "Production", "Procurement", "QC", "Dispatch", "Admin"];

export function SignupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState<Department>("Sales");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

    startTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const emailRedirectTo =
            typeof window === "undefined" ? undefined : `${window.location.origin}/api/auth/callback`;

          const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              emailRedirectTo,
              data: {
                full_name: fullName.trim(),
                department
              }
            }
          });

          if (signUpError) {
            throw signUpError;
          }

          if (data.session) {
            router.push("/dashboard");
            router.refresh();
            return;
          }

          setMessage("Account created. If email confirmation is enabled, check your inbox before signing in.");
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to create your account.");
        }
      })();
    });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="fullName">
          Full name
        </label>
        <input
          id="fullName"
          type="text"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
          placeholder="Nirvaan Sawhney"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="signupEmail">
          Work email
        </label>
        <input
          id="signupEmail"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
          placeholder="team@kianfalcon.com"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink/70" htmlFor="department">
          Department
        </label>
        <select
          id="department"
          value={department}
          onChange={(event) => setDepartment(event.target.value as Department)}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
        >
          {departments.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <AuthPasswordField
        id="signupPassword"
        label="Password"
        value={password}
        onChange={setPassword}
        placeholder="Create a password"
        autoComplete="new-password"
      />

      <AuthPasswordField
        id="confirmPassword"
        label="Confirm password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Re-enter your password"
        autoComplete="new-password"
      />

      {message ? <p className="rounded-2xl bg-pine/10 px-4 py-3 text-sm text-pine">{message}</p> : null}
      {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-ink/60">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-pine transition hover:text-ink">
          Sign in
        </Link>
      </p>
    </form>
  );
}
