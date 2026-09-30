import { useState } from 'react';
import { useStore } from '@leaf/plugin-sdk/react';
import { Modal } from '@leaf/ui/primitives/composition';
import { Button } from '@leaf/ui/primitives/button';
import { Input } from '@leaf/ui/primitives/input';
import type { InteractionsService, PromptRequest } from '../../core/documents/interactions';

export function InteractionDialog({ service }: { service: InteractionsService }) {
  const request = useStore(service.state);
  return request ? (
    <Prompt key={request.id} request={request} onSubmit={(value) => service.finish(value)} />
  ) : null;
}
function Prompt({
  request,
  onSubmit,
}: {
  request: PromptRequest;
  onSubmit(value: string | null): void;
}) {
  const [value, setValue] = useState('');
  return (
    <Modal title={request.label} onClose={() => onSubmit(null)}>
      {request.kind === 'choice' ? (
        <div className="modal-actions">
          {request.options?.map((option) => (
            <Button key={option.id} onClick={() => onSubmit(option.id)}>
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <Input
            autoFocus
            type="password"
            aria-label="文件密码"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <p className="small muted">密码仅在本次打开时使用。</p>
          <div className="modal-actions">
            <Button variant="outline" type="button" onClick={() => onSubmit(null)}>
              取消
            </Button>
            <Button type="submit">打开</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
