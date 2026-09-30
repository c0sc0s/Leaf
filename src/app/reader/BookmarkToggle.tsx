import { Bookmark, BookmarkPlus } from '@leaf/ui/icons';
import { IconButton } from '@leaf/ui/primitives/composition';

/** The filled glyph alone signals the saved state, so the button skips the panel-style active background. */
export function BookmarkToggle({
  bookmarked,
  onToggle,
}: {
  bookmarked: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      label={bookmarked ? '移除书签' : '添加书签'}
      aria-pressed={bookmarked}
      onClick={onToggle}
    >
      {bookmarked ? <Bookmark size={17} fill="currentColor" /> : <BookmarkPlus size={17} />}
    </IconButton>
  );
}
