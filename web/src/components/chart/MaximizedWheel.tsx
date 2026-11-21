import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** The side of the maximised wheel: as large as the window allows, leaving a margin and room for the close button. */
export const MAXIMIZED_WHEEL_SIZE = "min(calc(100vw - 2rem), calc(100dvh - 2rem))";

interface MaximizedWheelProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  closeLabel: string;
  /** The wheel; it is mounted only while the dialog is open. */
  children: ReactNode;
}

/**
 * The wheel over the whole window. It is a native modal `dialog`: the browser keeps the focus inside, closes it
 * on Escape, makes the page behind inert and returns the focus to the button that opened it. A click on the
 * empty area around the wheel closes it as well.
 */
export default function MaximizedWheel({ open, onClose, label, closeLabel, children }: MaximizedWheelProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The page behind must not scroll while the wheel is over it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-wheel-maximized={open ? "open" : "closed"}
      // The browser closes the dialog itself on Escape; this keeps the page's state in step with it.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none items-center justify-center bg-transparent p-0 text-white open:flex backdrop:bg-[#05070f]/95 backdrop:backdrop-blur-sm"
    >
      {open && children}
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8fb6ff]"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </dialog>
  );
}
