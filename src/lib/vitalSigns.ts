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
export function calcularIMC(peso: string, altura: string): number | null {
  const numero = (value: string) => {
    const normalized = value.trim().replace(',', '.');
    return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) ? Number(normalized) : NaN;
  };
  const p = numero(peso), a = numero(altura);
  if (!(p > 0) || !(a > 0)) return null;
  const h = a > 3 ? a / 100 : a;
  const imc = p / (h * h);
  return Number.isFinite(imc) ? Number(imc.toFixed(1)) : null;
}
