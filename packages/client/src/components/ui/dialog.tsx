import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        // Tablet+ : a normal centered modal with rounded corners and a card surface.
        // Mobile  : the @media rule in index.css collapses width/height to fill the
        //           viewport — we just don't fight it here. bg-card stays so the
        //           dialog is opaque whatever the breakpoint.
        'backdrop:bg-foreground/50 rounded-xl border border-border bg-card text-card-foreground p-0 shadow-xl max-w-lg w-full',
        className,
      )}
    >
      {/* Tighter padding on phones; reserve room for the iOS notch / home
          indicator via safe-area padding so titles & footer buttons aren't
          eaten by the system chrome. */}
      <div
        className="p-4 sm:p-6 max-md:pt-[max(1rem,env(safe-area-inset-top))] max-md:pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {children}
      </div>
    </dialog>
  );
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold', className)}>{children}</h2>;
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-6 flex justify-end gap-2', className)}>{children}</div>;
}
