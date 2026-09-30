import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { atmosphereBackground, readCoverPalette, type PaletteColor } from './coverPalette';
import type { DocumentMetadata } from '@leaf/contracts/documents';

const palettes = new Map<string, PaletteColor[]>();

function useCoverPalette(book: DocumentMetadata) {
  const [palette, setPalette] = useState(() => palettes.get(book.id));
  useEffect(() => {
    const cached = palettes.get(book.id);
    setPalette(cached);
    if (cached || !book.cover) return;
    let current = true;
    void readCoverPalette(book.cover).then((colors) => {
      palettes.set(book.id, colors);
      if (current) setPalette(colors);
    });
    return () => {
      current = false;
    };
  }, [book.id, book.cover]);
  return palette;
}

/** Tints the top of the shelf with the colours of the book being read, crossfading when it changes. */
export function ReadingAtmosphere({ book }: { book: DocumentMetadata }) {
  const palette = useCoverPalette(book);
  return (
    <AnimatePresence initial={false}>
      {palette && palette.length > 0 && (
        <m.div
          key={book.id}
          className="reading-atmosphere"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          style={
            {
              '--atmosphere-light': atmosphereBackground(palette, false),
              '--atmosphere-dark': atmosphereBackground(palette, true),
            } as CSSProperties
          }
        />
      )}
    </AnimatePresence>
  );
}
