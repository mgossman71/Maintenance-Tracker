import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError, api, type EquipmentRow } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAttachmentMutations, useAttachments } from "@/hooks/use-history";
import { daysAgo } from "@/lib/format";

/** The Documents tab: manuals, receipts, warranty cards — served as downloads. */
export function DocumentsPane({ equipment }: { equipment: EquipmentRow }) {
  const attachments = useAttachments(equipment.id);
  const mutations = useAttachmentMutations(equipment.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const docs = (attachments.data ?? []).filter((a) => a.interventionId === null);

  return (
    <div className="space-y-3" data-testid="documents-pane">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        data-testid="document-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) mutations.upload.mutate(f, { onSuccess: () => (e.target.value = "") });
        }}
      />
      <div className="flex justify-end">
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={mutations.upload.isPending}
          data-testid="upload-document-button"
        >
          <Upload /> {mutations.upload.isPending ? "Uploading…" : "Upload document"}
        </Button>
      </div>
      {mutations.upload.isError && (
        <p role="alert" className="text-sm text-destructive" data-testid="upload-error">
          {uploadMessage(mutations.upload.error)}
        </p>
      )}

      {attachments.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {docs.length === 0 && !attachments.isPending && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No documents yet — titles, manuals, receipts. Every upload is content-sniffed and always
            downloaded, never rendered.
          </CardContent>
        </Card>
      )}

      <ul className="space-y-2">
        {docs.map((a) => (
          <li key={a.id}>
            <Card>
              <CardContent className="flex items-center gap-3 p-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.filename}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(a.sizeBytes)} · {daysAgo(a.createdAt.slice(0, 10))}
                </span>
                <a
                  href={api.attachments.url(a.id)}
                  className="inline-flex size-9 items-center justify-center rounded-md hover:bg-secondary"
                  aria-label={`Download ${a.filename}`}
                  data-testid={`download-${a.id}`}
                >
                  <Download className="size-4" />
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${a.filename}`}
                  onClick={() => setDeleting(a.id)}
                  data-testid={`delete-document-${a.id}`}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete document?"
        confirmLabel="Delete"
        busy={mutations.remove.isPending}
        description="The file is removed from the server for good."
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting && mutations.remove.mutate(deleting, { onSuccess: () => setDeleting(null) })
        }
      />
    </div>
  );
}

function uploadMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "payload_too_large") return "That file is too large (25 MB cap).";
    if (err.code === "unsupported_media") return "That file type is not accepted.";
  }
  return "Upload failed.";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
