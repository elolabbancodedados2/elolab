import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { logAudit as registrarAuditoria } from '@/lib/auditTrail';

/**
 * Teto de segurança para o carregamento automático em blocos. Existe para que
 * uma tabela muito grande não trave o navegador tentando trazer tudo — nesse
 * caso a tela precisa de filtro por período ou paginação de verdade, e o aviso
 * no console diz isso.
 */
const MAX_LINHAS_AUTO = 20000;

/** Maior bloco que o PostgREST devolve numa resposta (max_rows padrão). */
const BLOCO_SERVIDOR = 1000;

// Generic hook for fetching data from a table
export function useSupabaseQuery<T>(
  tableName: string,
  options?: {
    select?: string;
    orderBy?: { column: string; ascending?: boolean };
    filters?: Array<{ column: string; operator: string; value: unknown }>;
    enabled?: boolean;
    staleTime?: number;
    limit?: number;
    page?: number;
    /** Mantém os dados anteriores enquanto um novo filtro carrega (evita piscar a tela inteira). */
    keepPrevious?: boolean;
  }
) {
  const { user, profile } = useSupabaseAuth();
  const limit = options?.limit ?? MAX_LINHAS_AUTO;
  const page = options?.page ?? 0;

  return useQuery({
    // A limpeza do cache na troca de conta/clínica não cancela requisições que
    // já estavam em andamento. Incluir o escopo na chave impede que a resposta
    // antiga seja reutilizada ou sobrescreva a consulta da clínica atual.
    queryKey: [tableName, user?.id ?? null, profile?.clinica_id ?? null, options],
    queryFn: async () => {
      const montar = () => {
        let query = supabase
          .from(tableName as any)
          .select(options?.select || '*');

        if (options?.filters) {
          for (const filter of options.filters) {
            query = query.filter(filter.column, filter.operator, filter.value);
          }
        }

        if (options?.orderBy) {
          query = query.order(options.orderBy.column, {
            ascending: options.orderBy.ascending ?? true,
          });
        }
        // Desempate estável: sem ele, paginar por uma coluna repetida (nome,
        // hora) pode repetir ou pular registros na fronteira entre blocos.
        if (options?.orderBy?.column !== 'id') {
          query = query.order('id', { ascending: true });
        }
        return query;
      };

      // Página explícita: o chamador controla a paginação.
      if (options?.page !== undefined) {
        const from = page * limit;
        const { data, error } = await montar().range(from, from + limit - 1);
        if (error) {
          console.error(`Error fetching ${tableName}:`, error);
          throw error;
        }
        return (data ?? []) as T[];
      }

      // Sem página: carregamos em blocos até `limit`. O bloco não pode passar
      // de BLOCO_SERVIDOR porque o PostgREST corta cada resposta no max_rows
      // dele (1000 por padrão). Antes o bloco era de 5000: o servidor devolvia
      // 1000, a checagem "veio cheio?" comparava com 5000 e parava — toda
      // clínica com mais de 1000 pacientes perdia o restante em silêncio.
      const teto = Math.min(limit, MAX_LINHAS_AUTO);
      const bloco = Math.min(teto, BLOCO_SERVIDOR);
      let rows: T[] = [];

      while (rows.length < teto) {
        const inicio = rows.length;
        const fim = Math.min(inicio + bloco, teto) - 1;
        const { data, error } = await montar().range(inicio, fim);
        if (error) {
          console.error(`Error fetching ${tableName}:`, error);
          // Falhar em vez de devolver um recorte que parece a lista completa.
          throw error;
        }
        const extra = (data ?? []) as T[];
        rows = rows.concat(extra);
        if (extra.length < fim - inicio + 1) break;
      }

      if (rows.length >= MAX_LINHAS_AUTO) {
        console.warn(
          `[${tableName}] atingiu o teto de ${MAX_LINHAS_AUTO} registros carregados de uma vez. ` +
          `Esta tela precisa de paginação ou filtro por período.`
        );
      }

      return rows;
    },
    enabled: options?.enabled !== false && !!user,
    ...(options?.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
    ...(options?.keepPrevious ? {
      placeholderData: (previousData: T[] | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined) => {
        const previousKey = previousQuery?.queryKey;
        return previousKey?.[1] === (user?.id ?? null) && previousKey?.[2] === (profile?.clinica_id ?? null)
          ? previousData
          : undefined;
      },
    } : {}),
  });
}

// Generic hook for updating data
export function useSupabaseUpdate<T extends Record<string, unknown>>(tableName: string) {
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<T> }) => {
      const { data: result, error } = await supabase
        .from(tableName as any)
        .update(data as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error(`Error updating ${tableName}:`, error);
        throw error;
      }

      // Log to audit
      await logAudit('update', tableName, id, user?.id, profile?.nome);

      return result as unknown as T;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tableName] });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar registro: ${error.message}`);
    },
  });
}

// Audit logging function
/**
 * Adaptador para a trilha de auditoria compartilhada.
 *
 * Havia aqui uma segunda implementação de `logAudit`, com o mesmo defeito que
 * já foi corrigido em `src/lib/auditTrail.ts`: `try { await insert() } catch`.
 * O supabase-js devolve `{ error }` em vez de lançar, então o catch nunca
 * disparava e a falha era invisível.
 *
 * Como estes hooks genéricos fazem create/update/delete de TODAS as tabelas,
 * esta era a maior lacuna de auditoria do sistema — bem maior que os pontos
 * pontuais já corrigidos nas telas de prontuário.
 *
 * A assinatura posicional foi mantida para não mexer nos três pontos de
 * chamada; o comportamento (checagem de erro e fila de reenvio) vem do módulo
 * compartilhado.
 */
async function logAudit(
  action: 'create' | 'update' | 'delete',
  collection: string,
  recordId: string,
  userId?: string,
  userName?: string
) {
  await registrarAuditoria({
    action,
    collection,
    recordId,
    userId,
    userName,
  });
}

// Specific hooks for each table

export function usePacientes() {
  return useSupabaseQuery<{
    id: string;
    nome: string;
    cpf: string | null;
    data_nascimento: string | null;
    telefone: string | null;
    email: string | null;
    sexo: string | null;
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    convenio_id: string | null;
    numero_carteira: string | null;
    validade_carteira: string | null;
    alergias: string[] | null;
    observacoes: string | null;
    foto_url: string | null;
    nome_responsavel: string | null;
    cpf_responsavel: string | null;
    parentesco_responsavel: string | null;
    created_at: string;
    updated_at: string;
  }>('pacientes', {
    orderBy: { column: 'nome', ascending: true },
  });
}

export function useMedicos() {
  return useSupabaseQuery<{
    id: string;
    user_id: string | null;
    nome: string | null;
    email: string | null;
    crm: string;
    crm_uf: string | null;
    cpf: string | null;
    rqe: string | null;
    especialidade: string | null;
    telefone: string | null;
    foto_url: string | null;
    carimbo_url: string | null;
    cns: string | null;
    intervalo_consulta: number | null;
    ativo: boolean;
    created_at: string;
    updated_at: string;
  }>('medicos', {
    orderBy: { column: 'nome', ascending: true },
  });
}

export function useConvenios() {
  return useSupabaseQuery<{
    id: string;
    nome: string;
    codigo: string;
    cnpj: string | null;
    telefone: string | null;
    email: string | null;
    website: string | null;
    tipo_planos: string[] | null;
    valor_consulta: number;
    valor_retorno: number;
    carencia: number;
    ativo: boolean;
    created_at: string;
    updated_at: string;
  }>('convenios', {
    orderBy: { column: 'nome', ascending: true },
  });
}

export function useAgendamentos(date?: string) {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_id: string;
    data: string;
    hora_inicio: string;
    hora_fim: string | null;
    tipo: string;
    status: string;
    observacoes: string | null;
    sala_id: string | null;
    created_at: string;
    updated_at: string;
  }>('agendamentos', {
    select: '*, pacientes(*), medicos(*)',
    orderBy: { column: 'hora_inicio', ascending: true },
    filters: date ? [{ column: 'data', operator: 'eq', value: date }] : undefined,
  });
}

/**
 * Agendamentos entre duas datas (inclusive). Use no lugar de
 * `useAgendamentos()` sem data, que traz o histórico inteiro da clínica.
 */
export function useAgendamentosPeriodo(inicio: string, fim: string, options?: { enabled?: boolean; keepPrevious?: boolean }) {
  return useSupabaseQuery<any>('agendamentos', {
    select: '*, pacientes(*), medicos(*)',
    orderBy: { column: 'hora_inicio', ascending: true },
    filters: [
      { column: 'data', operator: 'gte', value: inicio },
      { column: 'data', operator: 'lte', value: fim },
    ],
    enabled: options?.enabled,
    keepPrevious: options?.keepPrevious,
  });
}

export function useLancamentos() {
  return useSupabaseQuery<{
    id: string;
    tipo: string;
    categoria: string;
    descricao: string;
    valor: number;
    data: string;
    data_vencimento: string | null;
    data_emissao: string | null;
    status: string;
    paciente_id: string | null;
    agendamento_id: string | null;
    forma_pagamento: string | null;
    fornecedor: string | null;
    numero_documento: string | null;
    centro_custo: string | null;
    competencia: string | null;
    recorrente: boolean | null;
    frequencia_recorrencia: string | null;
    observacoes: string | null;
    anexo_url: string | null;
    created_at: string;
    updated_at: string;
  }>('lancamentos', {
    orderBy: { column: 'data', ascending: false },
  });
}

export function useEstoque() {
  return useSupabaseQuery<{
    id: string;
    nome: string;
    descricao: string | null;
    categoria: string;
    quantidade: number;
    quantidade_minima: number;
    unidade: string | null;
    valor_unitario: number;
    fornecedor: string | null;
    lote: string | null;
    validade: string | null;
    localizacao: string | null;
    created_at: string;
    updated_at: string;
  }>('estoque', {
    orderBy: { column: 'nome', ascending: true },
  });
}

export function useSalas() {
  return useSupabaseQuery<{
    id: string;
    nome: string;
    tipo: string | null;
    capacidade: number;
    equipamentos: string[] | null;
    status: string;
    medico_responsavel: string | null;
    created_at: string;
    updated_at: string;
  }>('salas', {
    orderBy: { column: 'nome', ascending: true },
  });
}

export function useFilaAtendimento() {
  return useSupabaseQuery<{
    id: string;
    agendamento_id: string;
    posicao: number;
    horario_chegada: string;
    status: string;
    cobranca_estado: 'pendente' | 'confirmada' | 'gratuita';
    sala_id: string | null;
    prioridade: string;
    created_at: string;
    updated_at: string;
    agendamentos: {
      data: string;
      status: string;
      paciente_id: string;
      medico_id: string;
      pacientes: { nome: string | null } | null;
      medicos: { nome: string | null; crm: string | null } | null;
    } | null;
  }>('fila_atendimento', {
    select: '*, agendamentos(*, pacientes(*), medicos(*))',
    orderBy: { column: 'posicao', ascending: true },
    staleTime: 1000 * 15, // 15 seconds for real-time queue
  });
}
