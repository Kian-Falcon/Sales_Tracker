"use client";

import { useState } from "react";

import { downloadMonthlyReportCsv } from "@/lib/api";

export function MonthlyReportExportButton({ month }: { month: string }) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    try {
      setPending(true);
      const blob = await downloadMonthlyReportCsv(month);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `workflow-report-${month}.csv`;
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
      className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Preparing report..." : "Export monthly CSV"}
    </button>
  );
}
