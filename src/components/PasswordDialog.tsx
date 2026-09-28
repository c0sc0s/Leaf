import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LockKeyhole } from '@/components/icons';
import { Modal } from './UI';

/**
 * Turns the password dialog into an awaitable prompt: `ask()` resolves with the entered
 * password, or null when the reader cancels. Render `dialog` once near the app root.
 */
export function usePasswordPrompt() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: string | null) => void) | null>(null);
  const ask = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );
  const finish = useCallback((value: string | null) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }, []);
  return { ask, dialog: open ? <PasswordDialog onSubmit={finish} /> : null };
}

function PasswordDialog({ onSubmit }: { onSubmit: (password: string | null) => void }) {
  const [value, setValue] = useState('');
  return (
    <Modal title="打开受保护的 PDF" onClose={() => onSubmit(null)}>
      <p className="muted">
        <LockKeyhole size={16} /> 此 PDF 受密码保护，请输入打开密码。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <Input
          autoFocus
          className="password-input"
          type="password"
          aria-label="PDF 密码"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="文件打开密码"
        />
        <p className="small muted">密码仅在本次打开时使用，不会写入书库。</p>
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={() => onSubmit(null)}>
            取消
          </Button>
          <Button variant="default" type="submit">
            打开 PDF
          </Button>
        </div>
      </form>
    </Modal>
  );
}
