/** Line widths, in percent, of the placeholder paragraphs. */
const LINES = [46, 0, 100, 96, 100, 90, 100, 68, 0, 100, 94, 100, 97, 58];

/**
 * A page-shaped placeholder that stands in for content while it loads, so the layout
 * never changes when the real page arrives. `label` is announced to assistive technology.
 */
export function PageSkeleton({ label, paper = true }: { label: string; paper?: boolean }) {
  return (
    <div className={`page-skeleton ${paper ? 'paper' : ''}`} role="status">
      <span className="visually-hidden">{label}</span>
      <div className="page-skeleton-lines" aria-hidden>
        {LINES.map((width, index) => (
          <i key={index} style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}
