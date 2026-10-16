export interface ConfigDiffRow {
  campo: string;
  atual: unknown;
  versao: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Compara dois snapshots JSON e retorna apenas os campos diferentes. */
export function compararConfiguracoes(atual: unknown, versao: unknown): ConfigDiffRow[] {
  const rows: ConfigDiffRow[] = [];
  const visit = (left: unknown, right: unknown, prefix: string) => {
    if (isRecord(left) && isRecord(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        visit(left[key], right[key], prefix ? `${prefix}.${key}` : key);
      }
      return;
    }
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      rows.push({ campo: prefix || 'valor', atual: left, versao: right });
    }
  };
  visit(atual, versao, '');
  return rows;
}

export function formatarValorConfiguracao(value: unknown): string {
  if (value === undefined) return 'Não definido';
  if (value === null) return 'Vazio';
  if (typeof value === 'string') return value || 'Vazio';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}
