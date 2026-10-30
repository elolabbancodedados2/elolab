export type Report = {
  id: string; category: string; severity: string; occurred_at: string; location_label: string;
  summary: string; immediate_action: string; status: string; reporter_confidential: boolean;
  reporter_display?: string; is_reporter?: boolean; assigned_to: string | null; due_at: string | null; created_at: string; updated_at: string;
};
export type Reviewer = { id: string; nome: string };
export type ReportUpdate = { id: string; from_status: string | null; to_status: string; review_note: string; corrective_action: string; created_at: string; actor_user_id: string | null };
export type CorrectionRequest = { id: string; previous_summary: string; previous_immediate_action: string; proposed_summary: string; proposed_immediate_action: string; reason: string; report_updated_at: string; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string; reviewed_at: string | null };
export type IndicadorKey = 'critical_open' | 'open' | 'action_required' | 'month' | 'closed';
export type Ordenacao = 'gravidade' | 'mais_recentes' | 'mais_antigos';
export type SafetyFilters = { search: string; indicador: IndicadorKey | 'todos'; severityFilter: string; statusFilter: string; ordenacao: Ordenacao };

export const CATEGORIES: Record<string, string> = {
  adverse_event: 'Evento adverso', near_miss: 'Quase incidente', unsafe_condition: 'Condição insegura',
  medication: 'Medicação', fall: 'Queda', infection: 'Infecção', equipment: 'Equipamento', other: 'Outro',
};
export const SEVERITIES: Record<string, string> = { low: 'Baixa', moderate: 'Moderada', high: 'Alta', critical: 'Crítica' };
export const SEVERITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
export const SEVERITY_CLASSES: Record<string, string> = {
  critical: 'border-transparent bg-destructive text-white hover:bg-destructive',
  high: 'border-destructive/30 bg-destructive/10 text-destructive',
  moderate: 'border-warning/40 bg-warning/10 text-warning-foreground',
  low: 'border-border bg-muted text-muted-foreground',
};
export const STATUSES: Record<string, string> = {
  submitted: 'Recebido', triage: 'Triagem', investigating: 'Em investigação', action_required: 'Ação necessária',
  monitoring: 'Monitorando', closed: 'Encerrado', reopened: 'Reaberto',
};
export const STATUS_CLASSES: Record<string, string> = {
  submitted: 'border-info/30 bg-info/10 text-info',
  triage: 'border-info/30 bg-info/10 text-info',
  investigating: 'border-primary/30 bg-primary/10 text-primary',
  action_required: 'border-warning/40 bg-warning/10 text-warning-foreground',
  monitoring: 'border-warning/40 bg-warning/10 text-warning-foreground',
  reopened: 'border-warning/40 bg-warning/10 text-warning-foreground',
  closed: 'border-success/30 bg-success/10 text-success',
};
export const SAFETY_TOAST_OPTIONS = { id: 'seguranca-assistencial', duration: 3500 };

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
