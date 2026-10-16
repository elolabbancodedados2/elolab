export function formatVitalMeasurement(
  value: string | number | null | undefined,
  unit = '',
): string {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return 'Não aferido';
  }
  const measurement = String(value).trim();
  if (!measurement) return 'Não aferido';
  return unit ? `${measurement} ${unit}` : measurement;
}
