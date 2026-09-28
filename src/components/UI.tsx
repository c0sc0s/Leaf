import { X, LoaderCircle } from '@/components/icons';
import { useRef } from 'react';
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { useIsPresent } from 'motion/react';
// Wrap AnimatePresence children so UI that is animating out can no longer be clicked or focused.
export function Exiting({ children }: { children: ReactNode }) {
  return (
    <div className="presence" inert={!useIsPresent()}>
      {children}
    </div>
  );
}
export function Tip({
  label,
  shortcut,
  side,
  children,
}: {
  label: string;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>

      <TooltipContent side={side} sideOffset={6}>
        {label}
        {shortcut && <kbd className="tooltip-shortcut">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
export function IconButton({
  children,
  label,
  active = false,
  className = '',
  shortcut,
  ...rest
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  shortcut?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <Tip label={label} shortcut={shortcut}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={`icon-button ${active ? 'active' : ''} ${className}`}
        aria-label={label}
        aria-pressed={active}
        {...rest}
      >
        {children}
      </Button>
    </Tip>
  );
}
export function Spinner({ text = '正在加载…' }: { text?: string }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>{text}</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const before = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="leaf-dialog"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          before.current?.focus();
        }}
      >
        <div className="modal-heading">
          <DialogTitle>{title}</DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
