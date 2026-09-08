import { redirect } from "next/navigation";

type ProjectPageSearchParams =
  | Promise<{ panel?: string | string[] | undefined; upload?: string | string[] | undefined }>
  | { panel?: string | string[] | undefined; upload?: string | string[] | undefined }
  | undefined;

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? undefined : value;
}

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: ProjectPageSearchParams;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const panel = getSingleValue(resolvedSearchParams?.panel);
  const upload = getSingleValue(resolvedSearchParams?.upload);
  const nextParams = new URLSearchParams({
    project: params.id
  });

  if (upload === "failed") {
    nextParams.set("upload", "failed");
    nextParams.set("panel", "documents");
  } else if (panel === "overview" || panel === "pipeline" || panel === "documents") {
    nextParams.set("panel", panel);
  }

  redirect(`/dashboard?${nextParams.toString()}`);
}
