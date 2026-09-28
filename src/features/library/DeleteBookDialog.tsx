import { Button } from '@/components/ui/button';
import type { Book } from '../../types';
import { Modal } from '../../components/UI';

export function DeleteBookDialog({
  book,
  onConfirm,
  onClose,
}: {
  book: Book;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="移除这本书？" onClose={onClose}>
      <p>将从本机书库移除「{book.title}」及其批注。你导入前的原始文件不受影响。</p>
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>
          保留
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          移除书籍和批注
        </Button>
      </div>
    </Modal>
  );
}
