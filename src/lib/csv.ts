/** Serializes one cell for semicolon-delimited Excel CSV files. */
export function formatCsvCell(value: unknown): string {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  // eslint-disable-next-line no-control-regex -- CSV formula guard includes C0 controls and leading spaces.
  const safe = /^[\u0000-\u0020]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
