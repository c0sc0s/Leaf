/** Records a failure in an optional feature that must not interrupt reading, with its context. */
export function reportError(context: string, error: unknown) {
  console.error(`[Leaf] ${context}`, error);
}

/** pdf.js rejects a render it was asked to cancel; that is expected, not a failure. */
export function isCancelledRender(error: unknown) {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}
