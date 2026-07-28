import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';

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
  }
) {
  const { user } = useSupabaseAuth();
  const limit = options?.limit ?? 5000;
  const page = options?.page ?? 0;

  return useQuery({
    queryKey: [tableName, options],
    queryFn: async () => {
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

      // Server-side pagination
      const from = page * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching ${tableName}:`, error);
        throw error;
      }

      // Truncagem silenciosa: quando a consulta devolve exatamente o limite, é
      // quase certo que existem mais registros e a tela está mostrando um
      // recorte sem avisar ninguém. Numa clínica com mais de 5.000 pacientes
      // isso aparece como "o paciente sumiu do sistema".
      if (data && data.length === limit && !options?.page) {
        console.warn(
          `[${tableName}] retornou exatamente o limite de ${limit} registros — ` +
          `provavelmente há mais dados. Use options.page para paginar.`
        );
      }

      return data as T[];
    },
    enabled: options?.enabled !== false && !!user,
    ...(options?.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
  });
}

// Generic hook for inserting data
export function useSupabaseInsert<T extends Record<string, unknown>>(tableName: string) {
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();

  return useMutation({
    mutationFn: async (data: Omit<T, 'id' | 'created_at' | 'updated_at'>) => {
       // Auto-inject clinica_id for tenant isolation if available in profile
       const insertData = { ...data, clinica_id: data.clinica_id || profile?.clinica_id } as any;

      const { data: result, error } = await supabase
        .from(tableName as any)
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error(`Error inserting into ${tableName}:`, error);
        throw error;
      }

      // Log to audit
      await logAudit('create', tableName, (result as any).id, user?.id, profile?.nome);

      return result as unknown as T;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tableName] });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar registro: ${error.message}`);
    },
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

// Generic hook for deleting data
export function useSupabaseDelete(tableName: string) {
  const queryClient = useQueryClient();
  const { user, profile } = useSupabaseAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(tableName as any)
        .delete()
        .eq('id', id);

      if (error) {
        console.error(`Error deleting from ${tableName}:`, error);
        throw error;
      }

      // Log to audit
      await logAudit('delete', tableName, id, user?.id, profile?.nome);

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [tableName] });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir registro: ${error.message}`);
    },
  });
}

// Audit logging function
async function logAudit(
  action: 'create' | 'update' | 'delete',
  collection: string,
  recordId: string,
  userId?: string,
  userName?: string
) {
  try {
    await supabase.from('audit_log').insert({
      action,
      collection,
      record_id: recordId,
      user_id: userId,
      user_name: userName,
    });
  } catch (error) {
    console.error('Error logging audit:', error);
  }
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
    sala_id: string | null;
    prioridade: string;
    created_at: string;
    updated_at: string;
  }>('fila_atendimento', {
    select: '*, agendamentos(*, pacientes(*), medicos(*))',
    orderBy: { column: 'posicao', ascending: true },
    staleTime: 1000 * 15, // 15 seconds for real-time queue
  });
}

export function useAuditLog() {
  return useSupabaseQuery<{
    id: string;
    user_id: string | null;
    user_name: string | null;
    action: string;
    collection: string;
    record_id: string;
    record_name: string | null;
    changes: Record<string, unknown> | null;
    timestamp: string;
  }>('audit_log', {
    orderBy: { column: 'timestamp', ascending: false },
  });
}

// ─── Additional hooks added for completeness ───────────────

export function useProntuarios(pacienteId?: string) {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_id: string | null;
    data: string;
    queixa_principal: string | null;
    historia_doenca_atual: string | null;
    exames_fisicos: string | null;
    hipotese_diagnostica: string | null;
    conduta: string | null;
    created_at: string;
    updated_at: string;
  }>('prontuarios', {
    orderBy: { column: 'data', ascending: false },
    filters: pacienteId ? [{ column: 'paciente_id', operator: 'eq', value: pacienteId }] : undefined,
  });
}

export function usePrescricoes(pacienteId?: string) {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_id: string | null;
    prontuario_id: string | null;
    medicamento: string;
    dosagem: string | null;
    posologia: string | null;
    duracao: string | null;
    observacoes: string | null;
    tipo: string;
    data_emissao: string;
    created_at: string;
  }>('prescricoes', {
    orderBy: { column: 'data_emissao', ascending: false },
    filters: pacienteId ? [{ column: 'paciente_id', operator: 'eq', value: pacienteId }] : undefined,
  });
}

export function useTriagens() {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    agendamento_id: string | null;
    enfermeiro_id: string;
    pressao_arterial: string | null;
    frequencia_cardiaca: number | null;
    temperatura: number | null;
    saturacao: number | null;
    peso: number | null;
    altura: number | null;
    classificacao_risco: string;
    queixa_principal: string | null;
    observacoes: string | null;
    data_hora: string;
  }>('triagens', {
    orderBy: { column: 'data_hora', ascending: false },
    staleTime: 1000 * 15,
  });
}

export function useTarefas() {
  return useSupabaseQuery<{
    id: string;
    titulo: string;
    descricao: string | null;
    status: string;
    prioridade: string;
    responsavel_id: string | null;
    prazo: string | null;
    tags: string[] | null;
    created_at: string;
    updated_at: string;
  }>('tarefas', {
    orderBy: { column: 'created_at', ascending: false },
  });
}

export function useRetornos() {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_id: string;
    agendamento_id: string | null;
    prontuario_id: string | null;
    data_retorno_prevista: string;
    data_consulta_origem: string;
    motivo: string | null;
    status: string | null;
    tipo_retorno: string | null;
    lembrete_enviado: boolean | null;
    observacoes: string | null;
    created_at: string;
    updated_at: string;
  }>('retornos', {
    orderBy: { column: 'data_retorno_prevista', ascending: true },
  });
}

export function useFuncionarios() {
  return useSupabaseQuery<{
    id: string;
    user_id: string | null;
    nome: string;
    cpf: string | null;
    cargo: string | null;
    departamento: string | null;
    email: string | null;
    telefone: string | null;
    data_admissao: string | null;
    salario: number | null;
    ativo: boolean;
    created_at: string;
    updated_at: string;
  }>('funcionarios', {
    orderBy: { column: 'nome', ascending: true },
  });
}

export function useAtestados(medicoId?: string) {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_id: string;
    tipo: string | null;
    motivo: string | null;
    cid: string | null;
    dias: number | null;
    data_emissao: string | null;
    data_inicio: string | null;
    data_fim: string | null;
    observacoes: string | null;
    created_at: string;
    updated_at: string;
  }>('atestados', {
    orderBy: { column: 'data_emissao', ascending: false },
    filters: medicoId ? [{ column: 'medico_id', operator: 'eq', value: medicoId }] : undefined,
  });
}

export function useExames(medicoId?: string) {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_solicitante_id: string;
    tipo_exame: string;
    descricao: string | null;
    resultado: string | null;
    arquivo_resultado: string | null;
    status: string | null;
    data_solicitacao: string | null;
    data_agendamento: string | null;
    data_realizacao: string | null;
    observacoes: string | null;
    created_at: string;
    updated_at: string;
  }>('exames', {
    orderBy: { column: 'data_solicitacao', ascending: false },
    filters: medicoId ? [{ column: 'medico_solicitante_id', operator: 'eq', value: medicoId }] : undefined,
  });
}

export function useEncaminhamentos(medicoId?: string) {
  return useSupabaseQuery<{
    id: string;
    paciente_id: string;
    medico_origem_id: string;
    medico_destino_id: string | null;
    especialidade_destino: string;
    motivo: string;
    hipotese_diagnostica: string | null;
    status: string | null;
    urgencia: string | null;
    data_encaminhamento: string | null;
    created_at: string;
    updated_at: string;
  }>('encaminhamentos', {
    orderBy: { column: 'data_encaminhamento', ascending: false },
    filters: medicoId ? [{ column: 'medico_origem_id', operator: 'eq', value: medicoId }] : undefined,
  });
}
