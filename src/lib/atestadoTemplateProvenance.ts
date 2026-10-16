import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';

interface AtestadoTemplateVersion {
  modelo_atestado_nome?: string | null;
  modelo_atestado_atualizado_em?: string | null;
}

export function selectedAtestadoTemplateId(template: ({ id?: string | null } & Record<string, unknown>) | null | undefined): string | null {
  return template?.id?.trim() || null;
}

export function atestadoTemplateVersionLabel(version: AtestadoTemplateVersion): string | null {
  const name = version.modelo_atestado_nome?.trim();
  if (!name) return null;

  const updatedAt = version.modelo_atestado_atualizado_em;
  if (!updatedAt) return `Modelo: ${name}`;

  const revision = formatDateTimeSaoPaulo(updatedAt);
  if (revision === '—') return `Modelo: ${name}`;
  return `Modelo: ${name} · revisão ${revision}`;
}
