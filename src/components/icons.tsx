import { HugeiconsIcon } from '@hugeicons/react';
import type { ComponentProps } from 'react';
import {
  ArrowLeftIcon as ArrowLeftGlyph,
  ArrowUpRightIcon as ArrowUpRightGlyph,
  BookOpenIcon as BookOpenGlyph,
  Bookmark02Icon as BookmarkGlyph,
  BookmarkPlusIcon as BookmarkPlusGlyph,
  CheckIcon as CheckGlyph,
  ArrowDown01Icon as ChevronDownGlyph,
  ArrowLeft01Icon as ChevronLeftGlyph,
  ArrowRight01Icon as ChevronRightGlyph,
  Clock3 as Clock3Glyph,
  Columns2 as Columns2Glyph,
  CommandIcon as CommandGlyph,
  CopyIcon as CopyGlyph,
  FileTextIcon as FileTextGlyph,
  FolderOpenIcon as FolderOpenGlyph,
  GalleryVerticalIcon as GalleryVerticalGlyph,
  GalleryVerticalEndIcon as GalleryVerticalEndGlyph,
  GridViewIcon as Grid2X2Glyph,
  HeartIcon as HeartGlyph,
  HighlighterIcon as HighlighterGlyph,
  HistoryIcon as HistoryGlyph,
  ListIcon as ListGlyph,
  LockKeyholeIcon as LockKeyholeGlyph,
  MaximizeIcon as MaximizeGlyph,
  MinimizeIcon as MinimizeGlyph,
  MinusSignIcon as MinusGlyph,
  MonitorIcon as MonitorGlyph,
  Moon02Icon as MoonGlyph,
  MoreHorizontalIcon as MoreHorizontalGlyph,
  NotebookPenIcon as NotebookPenGlyph,
  PanelLeftIcon as PanelLeftGlyph,
  Edit02Icon as PencilGlyph,
  Add01Icon as PlusGlyph,
  RectangleVerticalIcon as RectangleVerticalGlyph,
  SearchIcon as SearchGlyph,
  Settings05Icon as Settings2Glyph,
  StickyNoteIcon as StickyNoteGlyph,
  SunIcon as SunGlyph,
  TableOfContentsIcon as TableOfContentsGlyph,
  Trash2 as Trash2Glyph,
  UnderlineIcon as UnderlineGlyph,
  UploadIcon as UploadGlyph,
  Cancel01Icon as XGlyph,
} from '@hugeicons/core-free-icons';

type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, 'icon'>;
type Glyph = ComponentProps<typeof HugeiconsIcon>['icon'];

/** Wraps a Hugeicons glyph with the app's default size and stroke; props still override both. */
function icon(glyph: Glyph, name: string) {
  const Icon = (props: IconProps) => (
    <HugeiconsIcon icon={glyph} size={18} strokeWidth={1.8} aria-hidden="true" {...props} />
  );
  Icon.displayName = name;
  return Icon;
}

export const ArrowLeft = icon(ArrowLeftGlyph, 'ArrowLeft');
export const ArrowUpRight = icon(ArrowUpRightGlyph, 'ArrowUpRight');
export const BookOpen = icon(BookOpenGlyph, 'BookOpen');
export const Bookmark = icon(BookmarkGlyph, 'Bookmark');
export const BookmarkPlus = icon(BookmarkPlusGlyph, 'BookmarkPlus');
export const Check = icon(CheckGlyph, 'Check');
export const ChevronDown = icon(ChevronDownGlyph, 'ChevronDown');
export const ChevronLeft = icon(ChevronLeftGlyph, 'ChevronLeft');
export const ChevronRight = icon(ChevronRightGlyph, 'ChevronRight');
export const Clock3 = icon(Clock3Glyph, 'Clock3');
export const Columns2 = icon(Columns2Glyph, 'Columns2');
export const Command = icon(CommandGlyph, 'Command');
export const Copy = icon(CopyGlyph, 'Copy');
export const FileText = icon(FileTextGlyph, 'FileText');
export const FolderOpen = icon(FolderOpenGlyph, 'FolderOpen');
export const GalleryVertical = icon(GalleryVerticalGlyph, 'GalleryVertical');
export const GalleryVerticalEnd = icon(GalleryVerticalEndGlyph, 'GalleryVerticalEnd');
export const Grid2X2 = icon(Grid2X2Glyph, 'Grid2X2');
export const Heart = icon(HeartGlyph, 'Heart');
export const Highlighter = icon(HighlighterGlyph, 'Highlighter');
export const History = icon(HistoryGlyph, 'History');
export const List = icon(ListGlyph, 'List');
export const LockKeyhole = icon(LockKeyholeGlyph, 'LockKeyhole');
export const Maximize = icon(MaximizeGlyph, 'Maximize');
export const Minimize = icon(MinimizeGlyph, 'Minimize');
export const Minus = icon(MinusGlyph, 'Minus');
export const Monitor = icon(MonitorGlyph, 'Monitor');
export const Moon = icon(MoonGlyph, 'Moon');
export const MoreHorizontal = icon(MoreHorizontalGlyph, 'MoreHorizontal');
export const NotebookPen = icon(NotebookPenGlyph, 'NotebookPen');
export const Pencil = icon(PencilGlyph, 'Pencil');
export const PanelLeft = icon(PanelLeftGlyph, 'PanelLeft');
export const Plus = icon(PlusGlyph, 'Plus');
export const RectangleVertical = icon(RectangleVerticalGlyph, 'RectangleVertical');
export const Search = icon(SearchGlyph, 'Search');
export const Settings2 = icon(Settings2Glyph, 'Settings2');
export const StickyNote = icon(StickyNoteGlyph, 'StickyNote');
export const Sun = icon(SunGlyph, 'Sun');
export const TableOfContents = icon(TableOfContentsGlyph, 'TableOfContents');
export const Trash2 = icon(Trash2Glyph, 'Trash2');
export const Underline = icon(UnderlineGlyph, 'Underline');
export const Upload = icon(UploadGlyph, 'Upload');
export const X = icon(XGlyph, 'X');
