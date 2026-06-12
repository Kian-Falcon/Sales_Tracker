"use client";

import { downloadProjectsCsv } from "@/lib/api";

export function ExportButton() {
  const handleClick = async () => {
    const blob = await downloadProjectsCsv();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "workflow-tracker-export.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold hover:text-gold"
    >
      Export CSV
    </button>
  );
}
