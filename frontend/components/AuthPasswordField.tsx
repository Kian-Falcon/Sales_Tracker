"use client";

import { useState } from "react";

type AuthPasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  onChange: (value: string) => void;
};

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.7 6.3A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.4 4.2" />
      <path d="M6.1 6.6C4 8.1 2.5 12 2.5 12s3.5 6 9.5 6c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
    </svg>
  );
}

export function AuthPasswordField({
  id,
  label,
  value,
  placeholder,
  autoComplete = "current-password",
  required = true,
  onChange
}: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-ink/70" htmlFor={id}>
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-gold"
          placeholder={placeholder}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-3 my-auto flex h-9 w-9 items-center justify-center rounded-full text-ink/45 transition hover:bg-sand/70 hover:text-ink"
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    </div>
  );
}
