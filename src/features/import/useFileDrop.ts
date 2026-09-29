import { useRef, useState, type DragEvent } from 'react';
import type { ImportSource } from '../../types';
import { droppedSources } from '../../lib/markdown';

/**
 * Tracks files dragged over a drop zone. Enter/leave fire for every child element,
 * so a depth counter decides when the drag has really left.
 */
export function useFileDrop(
  onDrop: (sources: ImportSource[]) => Promise<void>,
  notify: (message: string) => void,
) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };
  const dropProps = {
    onDragEnter: (event: DragEvent) => {
      event.preventDefault();
      if (!event.dataTransfer.types.includes('Files')) return;
      depth.current++;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent) => {
      event.preventDefault();
      depth.current--;
      if (depth.current <= 0) reset();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      reset();
      void droppedSources(event.dataTransfer)
        .then(onDrop)
        .catch((error) => notify('无法导入：' + String(error)));
    },
  };
  return { dragging, dropProps };
}
