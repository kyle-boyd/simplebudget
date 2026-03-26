import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';

const MODAL_OVERLAY_CLASS = 'bg-black/20 pointer-events-auto';

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {children}
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

interface ResponsiveDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogContent> {}

export const ResponsiveDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  ResponsiveDialogContentProps
>(({ className, children, ...props }, ref) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <SheetContent
        ref={ref as React.Ref<HTMLDivElement>}
        side="bottom"
        className={cn('max-h-[90vh] overflow-y-auto rounded-t-lg', className)}
        overlayClassName={MODAL_OVERLAY_CLASS}
        {...props}
      >
        {children}
      </SheetContent>
    );
  }
  return (
    <DialogContent ref={ref} className={className} {...props}>
      {children}
    </DialogContent>
  );
});
ResponsiveDialogContent.displayName = 'ResponsiveDialogContent';
