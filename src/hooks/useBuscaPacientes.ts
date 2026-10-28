import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

export interface PacienteResumo {
  id: string;
  nome: string;
  nome_social: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  ativo?: boolean;
  convenio_id?: string | null;
}

export interface ResultadoBuscaPacientes {
  pacientes: PacienteResumo[];
  incompleta: boolean;
}

const CAMPOS = 'id, nome, nome_social, cpf, telefone, email, data_nascimento, convenio_id, ativo';
export interface FiltrosBuscaPacientes {
  sexo?: string;
  convenio?: string;
  nascimentoApos?: string;
  nascimentoAte?: string;
}

export type StatusBuscaPacientes = 'ativos' | 'inativos' | 'todos';

/** Search, normalization and pagination run in the API under the caller's RLS. */
export async function buscarPacientes(
  termo: string,
  limite = 20,
  filtros: FiltrosBuscaPacientes = {},
  somenteFinanceiro = false,
  campos = CAMPOS,
  status: StatusBuscaPacientes = 'ativos',
  pagina = 0,
): Promise<ResultadoBuscaPacientes> {
  const tamanho = Math.max(1, Math.min(Math.trunc(limite) || 20, 100));
  const offset = Math.max(0, Math.trunc(pagina) || 0) * tamanho;
  const parametros = {
    p_termo: termo.trim() || null,
    p_limite: tamanho + 1,
    p_sexo: filtros.sexo || null,
    p_convenio_id: filtros.convenio && filtros.convenio !== 'particular' ? filtros.convenio : null,
    p_somente_particular: filtros.convenio === 'particular',
    p_nascimento_apos: filtros.nascimentoApos || null,
    p_nascimento_ate: filtros.nascimentoAte || null,
  };
  // The financial endpoint deliberately exposes only administrative summaries.
  const { data, error } = somenteFinanceiro
    ? await (supabase as any).rpc('buscar_pacientes_resumo_financeiro', { ...parametros, p_ids: null })
    : await (supabase as any).rpc('buscar_pacientes_paginado', {
      ...parametros, p_offset: offset, p_status: status,
    }).select(campos);
  if (error) throw error;
  const pacientes = (data ?? []) as PacienteResumo[];
  return { pacientes: pacientes.slice(0, tamanho), incompleta: pacientes.length > tamanho };
}

export function useBuscaPacientes(termo: string, opcoes?: {
  limite?: number;
  enabled?: boolean;
  filtros?: FiltrosBuscaPacientes;
  select?: 'id,nome,cpf,email' | typeof CAMPOS;
  status?: StatusBuscaPacientes;
  pagina?: number;
}) {
  const { user, profile } = useSupabaseAuth();
  const limite = opcoes?.limite ?? 20;
  const somenteFinanceiro = !!profile?.roles?.includes('financeiro') &&
    !profile.roles.some((role) => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role));
  // Começa já aparado: com o termo cru, `isDebouncing` ficava verdadeiro na
  // primeira renderização e disparava uma busca extra só pelo espaço.
  const [debounced, setDebounced] = useState(() => termo.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 250);
    return () => clearTimeout(t);
  }, [termo]);

  const query = useQuery({
    queryKey: ['busca-pacientes', user?.id ?? null, profile?.clinica_id ?? null, debounced, limite, opcoes?.filtros, opcoes?.select, opcoes?.status ?? 'ativos', opcoes?.pagina ?? 0, somenteFinanceiro],
    enabled: opcoes?.enabled !== false && !!profile?.clinica_id,
    placeholderData: (previousData, previousQuery) => {
      const [prefixo, usuarioAnterior, clinicaAnterior] = previousQuery?.queryKey ?? [];
      // Preserve rows while refining a search in the same workspace, but never
      // show one clinic's patient details after the signed-in scope changes.
      if (
        prefixo !== 'busca-pacientes' ||
        usuarioAnterior !== (user?.id ?? null) ||
        clinicaAnterior !== (profile?.clinica_id ?? null) ||
        JSON.stringify(previousQuery?.queryKey?.[5]) !== JSON.stringify(opcoes?.filtros) ||
        previousQuery?.queryKey?.[7] !== (opcoes?.status ?? 'ativos') ||
        previousQuery?.queryKey?.[8] !== (opcoes?.pagina ?? 0) ||
        previousQuery?.queryKey?.[9] !== somenteFinanceiro
      ) return undefined;
      return previousData;
    },
    staleTime: 30_000,
    queryFn: () => buscarPacientes(debounced, limite, opcoes?.filtros, somenteFinanceiro, opcoes?.select, opcoes?.status, opcoes?.pagina),
  });

  // A consulta atual leva 250 ms para começar. Enquanto isso, React Query pode
  // conservar os resultados da busca anterior como placeholder; informe ao
  // seletor que eles não pertencem ao texto que a pessoa acabou de digitar.
  return { ...query, isDebouncing: termo.trim() !== debounced };
}

/** Carrega um paciente pelo id — para exibir o selecionado fora da lista de busca. */
export function usePacienteResumo(id: string | null | undefined) {
  const { user, profile } = useSupabaseAuth();
  return useQuery({
    queryKey: queryKeys.pacienteResumo(profile?.clinica_id, user?.id, id),
    enabled: !!id && !!user && !!profile?.clinica_id,
    staleTime: 60_000,
    queryFn: async (): Promise<PacienteResumo | null> => {
      const somenteFinanceiro = !!profile?.roles?.includes('financeiro') &&
        !profile.roles.some((role) => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role));
      if (somenteFinanceiro) {
        const { data, error } = await (supabase as any).rpc('buscar_pacientes_resumo_financeiro', {
          p_ids: [id], p_termo: null, p_limite: 1,
          p_sexo: null, p_convenio_id: null, p_somente_particular: false,
          p_nascimento_apos: null, p_nascimento_ate: null,
        });
        if (error) throw error;
        return (data?.[0] as PacienteResumo | undefined) ?? null;
      }
      const { data, error } = await (supabase as any).from('pacientes').select(CAMPOS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
