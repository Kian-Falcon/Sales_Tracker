"use client";

import { useState } from "react";

import { downloadProjectsCsv } from "@/lib/api";

export function ExportButton() {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    try {
      setPending(true);
      const blob = await downloadProjectsCsv();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `workflow-tracker-${stamp}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void handleClick()}
      className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Preparing CSV..." : "Export CSV"}
    </button>
  );
}

