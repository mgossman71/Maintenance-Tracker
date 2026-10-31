import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Modal dialog over the native <dialog> element: focus trap, Escape and
 * top-layer stacking come from the platform, not from a dependency.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop-to-dismiss on a dialog; Escape is the keyboard equivalent, provided natively
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // clicks landing on the dialog's padding box are backdrop clicks
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-full max-w-md rounded-xl border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b p-4">
        <h2 id="dialog-title" className="font-semibold">
          {title}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

/** Destructive-action confirmation, e.g. deleting equipment. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-sm">
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">{description}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirm-button"
          >
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
