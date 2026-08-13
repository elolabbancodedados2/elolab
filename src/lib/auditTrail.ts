// Audit Trail System - reads/writes from Supabase audit_log table
import { supabase } from '@/integrations/supabase/client';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: 'create' | 'update' | 'delete';
  collection: string;
  recordId: string;
  recordName?: string;
  changes?: {
    field: string;
    oldValue?: any;
    newValue?: any;
  }[];
  userId?: string;
  userName?: string;
}

/**
 * Fila local de auditoria que não conseguiu ser gravada.
 *
 * A trilha do prontuário é exigência da CFM 1.821/07: precisa constar quem
 * acessou e quem alterou. Perder um registro por oscilação de rede é perder
 * prova, então guardamos e reenviamos.
 *
 * TRÊS DECISÕES DE PRIVACIDADE, todas aprendidas na revisão desta fila:
 *
 * 1. `sessionStorage`, não `localStorage`. O EloLab roda em computador de
 *    recepção compartilhado, e o próprio projeto se compromete a não deixar
 *    rastro clínico no navegador entre usuários. `localStorage` sobrevive à
 *    troca de turno; `sessionStorage` morre com a aba.
 *
 * 2. Sem conteúdo. `record_name` é nome de paciente e `changes` pode conter
 *    qualquer campo do prontuário. Nenhum dos dois entra na fila — guardamos
 *    apenas ids e a ação. O registro reenviado identifica QUEM fez O QUÊ em
 *    QUAL prontuário, que é o que a norma pede; o conteúdo já está no banco.
 *
 * 3. Some no logout, via `limparAuditoriaPendente()`.
 */
const CHAVE_PENDENTES = 'auditoria_pendente';
const MAX_PENDENTES = 200;

type LinhaAuditoria = Record<string, unknown>;

/** Versão sem conteúdo identificável, que é a única que pode ser guardada. */
function semDadoSensivel(linha: LinhaAuditoria): LinhaAuditoria {
  const { record_name, changes, user_name, ...seguro } = linha;
  return {
    ...seguro,
    // Marca que o registro veio da fila, para quem for auditar entender por que
    // este não tem nome preenchido.
    record_name: '(reenviado da fila — conteúdo omitido por privacidade)',
  };
}

function lerPendentes(): LinhaAuditoria[] {
  try {
    const bruto = sessionStorage.getItem(CHAVE_PENDENTES);
    return bruto ? (JSON.parse(bruto) as LinhaAuditoria[]) : [];
  } catch {
    return [];
  }
}

function guardarPendente(linha: LinhaAuditoria) {
  try {
    const fila = lerPendentes();
    fila.push(semDadoSensivel(linha));
    // Mantém as mais recentes: fila infinita estouraria a cota do navegador.
    sessionStorage.setItem(CHAVE_PENDENTES, JSON.stringify(fila.slice(-MAX_PENDENTES)));
  } catch {
    // Cota cheia ou storage indisponível — o console.error do chamador denuncia.
  }
}

/** Limpa a fila. Chamado no logout para não vazar entre turnos. */
export function limparAuditoriaPendente(): void {
  try {
    sessionStorage.removeItem(CHAVE_PENDENTES);
  } catch {
    // storage indisponível: não há o que limpar
  }
}

/**
 * Evita que duas chamadas simultâneas reenviem a mesma fila e criem duplicata
 * na auditoria — o `logAudit` é chamado de vários pontos ao mesmo tempo.
 */
let _reenviando = false;

/**
 * Tenta reenviar o que ficou pendente. Oportunista e silencioso.
 *
 * Reenvia UMA linha por vez de propósito. Em lote, `insert(fila)` é atômico:
 * uma única linha inválida faz o lote inteiro falhar para sempre, e a fila
 * trava — inclusive para os registros válidos que estão atrás dela.
 */
async function reenviarPendentes(): Promise<void> {
  if (_reenviando) return;

  const fila = lerPendentes();
  if (fila.length === 0) return;

  _reenviando = true;
  try {
    const naoEnviadas: LinhaAuditoria[] = [];
    let enviadas = 0;

    for (const linha of fila) {
      const { error } = await supabase.from('audit_log').insert(linha as any);
      if (error) {
        // 23514/23503 e afins são linha inválida: reenviar de novo nunca vai
        // funcionar e só travaria a fila. Descartamos e registramos o motivo.
        if (error.code?.startsWith('23')) {
          console.error('[auditoria] registro descartado por ser inválido:', error, linha);
          continue;
        }
        naoEnviadas.push(linha); // falha transitória: tenta na próxima
        continue;
      }
      enviadas++;
    }

    try {
      if (naoEnviadas.length === 0) sessionStorage.removeItem(CHAVE_PENDENTES);
      else sessionStorage.setItem(CHAVE_PENDENTES, JSON.stringify(naoEnviadas));
    } catch { /* storage indisponível */ }

    if (enviadas > 0) {
      console.info(`[auditoria] ${enviadas} registro(s) pendente(s) reenviado(s).`);
    }
  } finally {
    _reenviando = false;
  }
}

/**
 * Grava na trilha de auditoria.
 *
 * O corpo antigo era `try { await insert(...) } catch { console.error(...) }`.
 * O supabase-js NÃO lança em erro de API: devolve `{ error }`. Então o catch
 * nunca disparava e a falha era invisível até para o console — um prontuário
 * podia ser aberto ou alterado sem registro nenhum de quem foi.
 *
 * @returns `true` se gravou; `false` se ficou na fila para reenvio.
 */
export async function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<boolean> {
  const linha: LinhaAuditoria = {
    action: entry.action,
    collection: entry.collection,
    record_id: entry.recordId,
    record_name: entry.recordName || null,
    changes: entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : null,
    user_id: entry.userId || null,
    user_name: entry.userName || null,
  };

  const { error } = await supabase.from('audit_log').insert(linha as any);

  if (error) {
    // Loga a versão SEM nome de paciente: o console fica visível para quem
    // estiver na máquina e costuma ser coletado por ferramenta de erro.
    console.error('[auditoria] falha ao gravar — enfileirado para reenvio:', error, semDadoSensivel(linha));
    guardarPendente(linha);
    return false;
  }

  // Gravou: boa hora para escoar o que ficou para trás.
  await reenviarPendentes().catch(() => { /* oportunista */ });
  return true;
}

export async function getAuditLog(filters?: {
  collection?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(filters?.limit || 500);

  if (filters?.collection) query = query.eq('collection', filters.collection);
  if (filters?.action) query = query.eq('action', filters.action);
  if (filters?.startDate) query = query.gte('timestamp', filters.startDate);
  if (filters?.endDate) query = query.lte('timestamp', filters.endDate);

  const { data, error } = await query;
  if (error) {
    console.error('Error loading audit log:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    timestamp: row.timestamp,
    action: row.action as AuditEntry['action'],
    collection: row.collection,
    recordId: row.record_id,
    recordName: row.record_name,
    changes: row.changes as AuditEntry['changes'],
    userId: row.user_id,
    userName: row.user_name,
  }));
}

export async function clearAuditLog() {
  // We don't actually delete - just a no-op for safety
  console.warn('clearAuditLog: operation disabled for data safety');
}

// Helper to detect changes between objects
export function detectChanges(oldObj: any, newObj: any): { field: string; oldValue: any; newValue: any }[] {
  const changes: { field: string; oldValue: any; newValue: any }[] = [];
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  
  allKeys.forEach(key => {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') return;
    
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];
    
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, oldValue: oldVal, newValue: newVal });
    }
  });
  
  return changes;
}

// Collection labels for display
export const COLLECTION_LABELS: Record<string, string> = {
  pacientes: 'Pacientes',
  agendamentos: 'Agendamentos',
  prontuarios: 'Prontuários',
  prescricoes: 'Prescrições',
  atestados: 'Atestados',
  lancamentos: 'Lançamentos',
  estoque: 'Estoque',
  users: 'Usuários',
  medicos: 'Médicos',
  convenios: 'Convênios',
  salas: 'Salas',
  fila: 'Fila',
  prescription_templates: 'Templates Prescrição',
  certificate_templates: 'Templates Atestado',
};

export const ACTION_LABELS: Record<string, string> = {
  create: 'Criação',
  update: 'Atualização',
  delete: 'Exclusão',
};
