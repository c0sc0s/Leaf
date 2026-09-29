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
  const internalDrag = useRef(false);
  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };
  const dropProps = {
    onDragStart: (event: DragEvent) => {
      internalDrag.current = !event.defaultPrevented;
    },
    onDragEndCapture: () => {
      internalDrag.current = false;
      reset();
    },
    onDragEnter: (event: DragEvent) => {
      event.preventDefault();
      if (internalDrag.current || !event.dataTransfer.types.includes('Files')) return;
      depth.current++;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect =
        !internalDrag.current && event.dataTransfer.types.includes('Files') ? 'copy' : 'none';
    },
    onDragLeave: (event: DragEvent) => {
      event.preventDefault();
      if (internalDrag.current || !event.dataTransfer.types.includes('Files')) return;
      depth.current--;
      if (depth.current <= 0) reset();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const externalFiles = !internalDrag.current && event.dataTransfer.types.includes('Files');
      internalDrag.current = false;
      reset();
      if (!externalFiles) return;
      void droppedSources(event.dataTransfer)
        .then(onDrop)
        .catch((error) => notify('无法导入：' + String(error)));
    },
  };
  return { dragging, dropProps };
}
