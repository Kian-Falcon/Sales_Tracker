import { redirect } from "next/navigation";
import Link from "next/link";

import { ReportsWorkspace } from "@/components/ReportsWorkspace";
import { getMonthlyReport } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import type { Department, MonthlyReport } from "@/lib/types";

type SearchParamsInput =
  | Promise<{ month?: string | string[] | undefined }>
  | { month?: string | string[] | undefined }
  | undefined;

function getDefaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const previous = new Date(year, month - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function resolveMonthInput(rawMonth: string | string[] | undefined) {
  if (Array.isArray(rawMonth)) {
    return rawMonth[0] ?? getDefaultMonth();
  }

  return rawMonth ?? getDefaultMonth();
}

async function loadReportsBundle(month: string) {
  const { accessToken, department } = await getServerAuth();

  if (!accessToken) {
    redirect("/login");
  }

  if (department !== "Sales" && department !== "Admin") {
    return {
      department,
      report: null as MonthlyReport | null,
      previousReport: null as MonthlyReport | null,
      error: "Only Sales or Admin can access the monthly audit and reporting workspace.",
    };
  }

  try {
    const report = await getMonthlyReport(month, accessToken);
    let previousReport: MonthlyReport | null = null;

    try {
      previousReport = await getMonthlyReport(getPreviousMonth(month), accessToken);
    } catch {
      previousReport = null;
    }

    return {
      department,
      report,
      previousReport,
      error: null,
    };
  } catch (error) {
    return {
      department,
      report: null as MonthlyReport | null,
      previousReport: null as MonthlyReport | null,
      error: error instanceof Error ? error.message : "Unable to generate this monthly report right now.",
    };
  }
}

function ReportsUnavailable({ error }: { error: string }) {
  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="text-sm font-medium text-accent hover:text-ink">
        Back to dashboard
      </Link>

      <section className="rounded-[32px] border border-border bg-white p-8 shadow-panel">
        <h1 className="text-3xl font-semibold text-ink">Reports unavailable</h1>
        <p className="mt-3 text-sm text-ink/60">{error}</p>
      </section>
    </div>
  );
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const selectedMonth = resolveMonthInput(resolvedSearchParams?.month);
  const { department, report, previousReport, error } = await loadReportsBundle(selectedMonth);

  if (!report || !department || (department !== "Sales" && department !== "Admin")) {
    return <ReportsUnavailable error={error ?? "Unable to load the reporting workspace."} />;
  }

  return <ReportsWorkspace department={department as Department} report={report} previousReport={previousReport} />;
}

