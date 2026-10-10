import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { apenasDigitos, pacienteCorresponde } from '@/lib/buscaPaciente';

export interface PacienteResumo {
  id: string;
  nome: string;
  nome_social: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  convenio_id?: string | null;
}

export interface ResultadoBuscaPacientes {
  pacientes: PacienteResumo[];
  incompleta: boolean;
}

const CAMPOS = 'id, nome, nome_social, cpf, telefone, email, data_nascimento, convenio_id';
const TAMANHO_PAGINA = 1000;
const MAX_CANDIDATOS = 20000;

/**
 * Converte o termo num padrão ILIKE tolerante a acento e máscara.
 *
 * O banco não tem `unaccent`, então "joao" não casaria "João" num ILIKE puro.
 * Trocamos vogais e "c" por `_` (um caractere qualquer) para o servidor trazer
 * candidatos, e o filtro fino (`pacienteCorresponde`, que remove acento) roda
 * no cliente. Números são buscados nas colunas só com dígitos
 * (`cpf_digitos`/`telefone_digitos`); sem elas, em máscaras conhecidas.
 */
function padraoTexto(termo: string) {
  const seguro = termo.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[%_\\,()]/g, ' ');
  return `%${seguro.replace(/[aeiouçcáàâãéêíóôõúü]/gi, '_').replace(/ /g, '%')}%`;
}

function padroesDeMascara(digitos: string, mascara: string): string[] {
  const posicoes = [...mascara].flatMap((caractere, indice) => caractere === '#' ? [indice] : []);
  if (digitos.length > posicoes.length) return [];

  return Array.from({ length: posicoes.length - digitos.length + 1 }, (_, inicio) => {
    const fim = inicio + digitos.length - 1;
    const trecho = mascara.slice(posicoes[inicio], posicoes[fim] + 1);
    let indiceDigito = 0;
    return `%${trecho.replace(/#/g, () => digitos[indiceDigito++])}%`;
  });
}

/** Condições de CPF/telefone sobre o texto mascarado (antes da migration). */
function condicoesPorMascara(digitos: string): string[] {
  // Formatos encontrados nos cadastros: com e sem máscara, DDD com e sem
  // espaço, e número local sem DDD. Fora daqui o telefone não vira candidato
  // no servidor — o filtro do cliente não tem como recuperá-lo.
  const mascaras = {
    cpf: ['###.###.###-##', '###########'],
    telefone: [
      '(##) #####-####', '(##) ####-####',
      '(##)#####-####', '(##)####-####',
      '## #####-####', '## ####-####',
      '#####-####', '####-####',
      '###########', '##########',
    ],
  };
  // Máscaras diferentes podem gerar o mesmo trecho (ex.: dígitos sem
  // separador); repetir a condição só aumenta a URL.
  const padroes = new Set<string>();
  for (const mascara of mascaras.cpf) {
    for (const padrao of padroesDeMascara(digitos, mascara)) padroes.add(`cpf.ilike."${padrao}"`);
  }
  for (const mascara of mascaras.telefone) {
    for (const padrao of padroesDeMascara(digitos, mascara)) padroes.add(`telefone.ilike."${padrao}"`);
  }
  return [...padroes];
}

/**
 * As colunas `cpf_digitos`/`telefone_digitos` existem neste banco?
 *
 * Elas chegam pela migration 20261001240000. Até ela ser aplicada, filtrar
 * por elas devolve 42703 (coluna inexistente); nesse caso a busca refaz com
 * as máscaras e lembra o resultado para não errar de novo a cada tecla.
 * `null` = ainda não sabemos.
 */
let colunasDeDigitos: boolean | null = null;

/** Só para testes: volta a detectar as colunas na próxima busca. */
export function redefinirDeteccaoColunasDeDigitos() {
  colunasDeDigitos = null;
}

function colunaInexistente(erro: unknown): boolean {
  return (erro as { code?: unknown } | null)?.code === '42703';
}

/**
 * Busca de paciente no servidor, para telas que antes baixavam o cadastro
 * inteiro só para preencher um seletor. Devolve no máximo `limite` resultados.
 */
export interface FiltrosBuscaPacientes {
  sexo?: string;
  convenio?: string;
  nascimentoApos?: string;
  nascimentoAte?: string;
}

export async function buscarPacientes(termo: string, limite = 20, filtros: FiltrosBuscaPacientes = {}): Promise<ResultadoBuscaPacientes> {
  const busca = termo.trim();
  const criarConsulta = () => {
    let query = (supabase as any).from('pacientes').select(CAMPOS);
    if (filtros.sexo) query = query.eq('sexo', filtros.sexo);
    if (filtros.convenio === 'particular') query = query.is('convenio_id', null);
    else if (filtros.convenio) query = query.eq('convenio_id', filtros.convenio);
    if (filtros.nascimentoApos) query = query.gte('data_nascimento', filtros.nascimentoApos);
    if (filtros.nascimentoAte) query = query.lte('data_nascimento', filtros.nascimentoAte);
    return query;
  };

  if (!busca) {
    const limiteSeguro = Math.max(0, Math.min(limite, MAX_CANDIDATOS));
    const totalParaBuscar = limiteSeguro + 1;
    const encontrados: PacienteResumo[] = [];
    for (let inicio = 0; inicio < totalParaBuscar; inicio += TAMANHO_PAGINA) {
      const fim = Math.min(inicio + TAMANHO_PAGINA, totalParaBuscar) - 1;
      const { data, error } = await criarConsulta()
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(inicio, fim);
      if (error) throw error;
      const lote = (data ?? []) as PacienteResumo[];
      encontrados.push(...lote);
      if (lote.length < fim - inicio + 1) break;
    }
    return {
      pacientes: encontrados.slice(0, limiteSeguro),
      incompleta: encontrados.length > limiteSeguro || limite > limiteSeguro,
    };
  }

  const condicoesTexto = [
    `nome.ilike.${padraoTexto(busca)}`,
    `nome_social.ilike.${padraoTexto(busca)}`,
    `email.ilike.${padraoTexto(busca)}`,
  ];
  const digitos = apenasDigitos(busca);
  const buscaNumerica = digitos.length >= 3;

  const executar = async (condicoes: string[]): Promise<ResultadoBuscaPacientes> => {
    const encontrados: PacienteResumo[] = [];
    let incompleta = false;
    // O servidor limita cada resposta a 1000 linhas. Buscar só 3× o resultado
    // desejado e filtrar acentos depois podia descartar o paciente correto se
    // os primeiros candidatos (nome parecido, sem a grafia exata) ocupassem a
    // página inteira. Paginar até reunir resultados reais evita esse corte
    // silencioso sem carregar todo o cadastro quando os resultados aparecem cedo.
    for (let inicio = 0; inicio < MAX_CANDIDATOS && encontrados.length <= limite; inicio += TAMANHO_PAGINA) {
      const fim = Math.min(inicio + TAMANHO_PAGINA, MAX_CANDIDATOS) - 1;
      const { data, error } = await criarConsulta()
        .or(condicoes.join(','))
        .order('nome', { ascending: true })
        .order('id', { ascending: true })
        .range(inicio, fim);
      if (error) throw error;

      const candidatos = (data ?? []) as PacienteResumo[];
      encontrados.push(...candidatos.filter((p) => pacienteCorresponde(p, busca)));
      if (encontrados.length > limite) {
        incompleta = true;
        break;
      }
      if (candidatos.length < fim - inicio + 1) break;
      if (inicio + candidatos.length >= MAX_CANDIDATOS && encontrados.length < limite) incompleta = true;
    }
    return { pacientes: encontrados.slice(0, limite), incompleta };
  };

  if (!buscaNumerica) return executar(condicoesTexto);

  if (colunasDeDigitos !== false) {
    // Dígitos contínuos sobre a coluna sem máscara: casa qualquer formato
    // gravado ("+55 11 98888-7777" inclusive) sem varrer candidatos frouxos.
    try {
      const resultado = await executar([
        ...condicoesTexto,
        `cpf_digitos.like.%${digitos}%`,
        `telefone_digitos.like.%${digitos}%`,
      ]);
      colunasDeDigitos = true;
      return resultado;
    } catch (erro) {
      if (!colunaInexistente(erro)) throw erro;
      colunasDeDigitos = false;
    }
  }
  return executar([...condicoesTexto, ...condicoesPorMascara(digitos)]);
}

export function useBuscaPacientes(termo: string, opcoes?: { limite?: number; enabled?: boolean; filtros?: FiltrosBuscaPacientes }) {
  const { user, profile } = useSupabaseAuth();
  const limite = opcoes?.limite ?? 20;
  // Começa já aparado: com o termo cru, `isDebouncing` ficava verdadeiro na
  // primeira renderização e disparava uma busca extra só pelo espaço.
  const [debounced, setDebounced] = useState(() => termo.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 250);
    return () => clearTimeout(t);
  }, [termo]);

  const query = useQuery({
    queryKey: ['busca-pacientes', user?.id ?? null, profile?.clinica_id ?? null, debounced, limite, opcoes?.filtros],
    enabled: opcoes?.enabled !== false && !!profile?.clinica_id,
    placeholderData: (previousData, previousQuery) => {
      const [prefixo, usuarioAnterior, clinicaAnterior] = previousQuery?.queryKey ?? [];
      // Preserve rows while refining a search in the same workspace, but never
      // show one clinic's patient details after the signed-in scope changes.
      if (
        prefixo !== 'busca-pacientes' ||
        usuarioAnterior !== (user?.id ?? null) ||
        clinicaAnterior !== (profile?.clinica_id ?? null) ||
        JSON.stringify(previousQuery?.queryKey?.[5]) !== JSON.stringify(opcoes?.filtros)
      ) return undefined;
      return previousData;
    },
    staleTime: 30_000,
    queryFn: () => buscarPacientes(debounced, limite, opcoes?.filtros),
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
    queryKey: ['paciente-resumo', user?.id ?? null, profile?.clinica_id ?? null, id],
    enabled: !!id && !!user && !!profile?.clinica_id,
    staleTime: 60_000,
    queryFn: async (): Promise<PacienteResumo | null> => {
      const { data, error } = await (supabase as any).from('pacientes').select(CAMPOS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
