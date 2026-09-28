import { useRef, useState, type DragEvent } from 'react';

/**
 * Tracks files dragged over a drop zone. Enter/leave fire for every child element,
 * so a depth counter decides when the drag has really left.
 */
export function useFileDrop(onDrop: (files: File[]) => void) {
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
      onDrop([...event.dataTransfer.files]);
    },
  };
  return { dragging, dropProps };
}
