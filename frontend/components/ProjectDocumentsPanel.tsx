"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { uploadProjectDocument } from "@/lib/api";
import type { Department, ProjectDocument } from "@/lib/types";
import { formatDateTime, formatFileSize } from "@/lib/utils";

const acceptedDocumentTypes = ".pdf,.csv,.xls,.xlsx,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg";

export function ProjectDocumentsPanel({
  projectId,
  documents,
  viewerDepartment
}: {
  projectId: string;
  documents: ProjectDocument[];
  viewerDepartment?: Department;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUpload = viewerDepartment === "Sales" || viewerDepartment === "Admin";

  const handleUpload = () => {
    if (!selectedFile) {
      return;
    }

    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await uploadProjectDocument(projectId, selectedFile, "boq");
          setSelectedFile(null);
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to upload the document.");
        }
      })();
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  return (
    <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">Documents</p>
          <h2 className="text-2xl font-semibold text-ink">BOQ and project files</h2>
          <p className="max-w-2xl text-sm text-ink/60">
            Keep the latest BOQ close to the workflow so Sales, R&amp;D, and production teams can open it quickly.
          </p>
        </div>

        {canUpload ? (
          <div className="w-full rounded-[24px] border border-dashed border-ink/15 bg-sand/35 p-4 lg:max-w-md">
            <input
              type="file"
              accept={acceptedDocumentTypes}
              onChange={handleFileChange}
              className="block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-pine"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!selectedFile || pending}
                onClick={handleUpload}
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? "Uploading..." : "Upload BOQ"}
              </button>
              {selectedFile ? <span className="text-sm text-pine">{selectedFile.name}</span> : null}
            </div>
            <p className="mt-2 text-xs text-ink/45">Sales and Admin can add or replace BOQ files at any time.</p>
            {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4">
        {documents.length ? (
          documents.map((document) => (
            <article
              key={document.id}
              className="flex flex-col gap-4 rounded-[24px] border border-ink/10 bg-sand/30 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/65">
                    {document.document_type}
                  </span>
                  <span className="text-sm font-semibold text-ink">{document.file_name}</span>
                </div>
                <p className="text-sm text-ink/55">
                  Uploaded {formatDateTime(document.created_at)}
                  {document.uploaded_by_name ? ` by ${document.uploaded_by_name}` : ""}
                </p>
                <p className="text-xs text-ink/45">
                  {document.content_type} • {formatFileSize(document.file_size)}
                </p>
              </div>

              {document.download_url ? (
                <a
                  href={document.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full border border-ink px-4 py-2 text-sm font-semibold text-ink transition hover:bg-ink hover:text-white"
                >
                  Open file
                </a>
              ) : (
                <span className="text-sm text-ink/45">Refresh to generate a fresh download link.</span>
              )}
            </article>
          ))
        ) : (
          <div className="rounded-[24px] border border-ink/10 bg-sand/25 px-4 py-5 text-sm text-ink/55">
            No BOQ uploaded yet. Add the first file from Sales or Admin when it is ready.
          </div>
        )}
      </div>
    </section>
  );
}
