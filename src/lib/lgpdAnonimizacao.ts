/**
 * Anonimização LGPD do cadastro do paciente, feita no banco numa transação.
 *
 * Substitui a exclusão tabela por tabela de lgpdCompliance.ts (suspensa em
 * CLIN-QA-004). Toda a regra — permissão, clínica, confirmação do nome,
 * bloqueio por atendimento em aberto e registro em lgpd_deletion_log — fica
 * na função lgpd_anonimizar_paciente
 * (supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql).
 * Este módulo só valida a entrada, chama a função e traduz o resultado.
 *
 * Prontuário, exames, prescrições e financeiro não são alterados (guarda
 * legal). Requer avaliação jurídica antes de ser liberado na interface.
 */

import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

/** Bucket onde PatientPhoto.tsx grava a foto (foto_url guarda o caminho). */
export const BUCKET_FOTOS_PACIENTE = 'patient-photos';

const entradaSchema = z.object({
  pacienteId: z.string().uuid('Paciente inválido.'),
  clinicaId: z.string().uuid('Clínica inválida.'),
  motivo: z
    .string()
    .trim()
    .min(10, 'Descreva o motivo com pelo menos 10 caracteres.')
    .max(2000, 'O motivo pode ter no máximo 2000 caracteres.'),
  confirmacaoNome: z.string().trim().min(1, 'Digite o nome completo do paciente para confirmar.'),
});

export type EntradaAnonimizacao = z.input<typeof entradaSchema>;

const contagensSchema = z.object({
  guias_externas: z.number(),
  tarefas: z.number(),
  portal_tokens: z.number(),
  lista_espera: z.number(),
  whatsapp_conversas: z.number(),
  auditoria: z.number(),
});

const sucessoSchema = z.object({
    anonimizado: z.literal(true),
    ja_anonimizado: z.literal(false),
    log_id: z.string(),
    rotulo: z.string(),
    contagens: contagensSchema,
    pendencias: z.object({
      foto_url: z.string().nullable(),
      whatsapp_conversas: z.number(),
    }),
  });

const jaAnonimizadoSchema = z.object({
  anonimizado: z.literal(false),
  ja_anonimizado: z.literal(true),
  anonimizado_em: z.string(),
});

export type ResultadoAnonimizacao =
  | {
      situacao: 'anonimizado';
      logId: string;
      rotulo: string;
      contagens: z.infer<typeof contagensSchema>;
      /** Itens que exigem ação manual do encarregado de dados. */
      pendencias: string[];
    }
  | { situacao: 'ja_anonimizado'; anonimizadoEm: string };

/** Códigos devolvidos em HINT pela função do banco. */
export type CodigoErroAnonimizacao =
  | 'LGPD_ENTRADA_INVALIDA'
  | 'LGPD_SEM_SESSAO'
  | 'LGPD_PARAMETRO_INVALIDO'
  | 'LGPD_SEM_PERMISSAO'
  | 'LGPD_MOTIVO_INVALIDO'
  | 'LGPD_PACIENTE_NAO_ENCONTRADO'
  | 'LGPD_CONFIRMACAO_NAO_CONFERE'
  | 'LGPD_AGENDAMENTO_ATIVO'
  | 'LGPD_RESPOSTA_INVALIDA'
  | 'LGPD_FALHA';

export const MENSAGENS_ANONIMIZACAO: Record<CodigoErroAnonimizacao, string> = {
  LGPD_ENTRADA_INVALIDA: 'Confira os dados informados.',
  LGPD_SEM_SESSAO: 'Sua sessão expirou. Entre novamente.',
  LGPD_PARAMETRO_INVALIDO: 'Paciente ou clínica não informados.',
  LGPD_SEM_PERMISSAO: 'Somente o administrador da clínica pode anonimizar um paciente.',
  LGPD_MOTIVO_INVALIDO: 'Descreva o motivo com 10 a 2000 caracteres.',
  LGPD_PACIENTE_NAO_ENCONTRADO: 'Paciente não encontrado nesta clínica.',
  LGPD_CONFIRMACAO_NAO_CONFERE: 'O nome digitado não corresponde ao cadastro do paciente.',
  LGPD_AGENDAMENTO_ATIVO:
    'O paciente tem agendamento futuro ou atendimento em aberto. Encerre ou cancele antes de anonimizar.',
  LGPD_RESPOSTA_INVALIDA: 'O servidor respondeu em formato inesperado. Avise o suporte.',
  LGPD_FALHA: 'Não foi possível anonimizar o paciente. Nenhum dado foi alterado.',
};

export class AnonimizacaoLgpdError extends Error {
  constructor(
    public readonly codigo: CodigoErroAnonimizacao,
    mensagem?: string
  ) {
    super(mensagem ?? MENSAGENS_ANONIMIZACAO[codigo]);
    this.name = 'AnonimizacaoLgpdError';
  }
}

function codigoDoErro(erro: { hint?: string | null; code?: string } | null): CodigoErroAnonimizacao {
  const hint = erro?.hint ?? '';
  if (hint in MENSAGENS_ANONIMIZACAO) return hint as CodigoErroAnonimizacao;
  if (erro?.code === '42501') return 'LGPD_SEM_PERMISSAO';
  return 'LGPD_FALHA';
}

/**
 * Anonimiza o cadastro do paciente. Lança AnonimizacaoLgpdError com código
 * traduzível; nunca devolve sucesso parcial do banco (a função é atômica).
 *
 * A remoção da foto no Storage acontece depois do commit. Se falhar, o
 * cadastro já está anonimizado e a foto entra em `pendencias`.
 */
export async function anonimizarPaciente(entrada: EntradaAnonimizacao): Promise<ResultadoAnonimizacao> {
  const validada = entradaSchema.safeParse(entrada);
  if (!validada.success) {
    throw new AnonimizacaoLgpdError(
      'LGPD_ENTRADA_INVALIDA',
      validada.error.issues[0]?.message ?? MENSAGENS_ANONIMIZACAO.LGPD_ENTRADA_INVALIDA
    );
  }
  const { pacienteId, clinicaId, motivo, confirmacaoNome } = validada.data;

  // A função ainda não está no types.ts gerado.
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { hint?: string | null; code?: string } | null }>)(
    'lgpd_anonimizar_paciente',
    {
      p_paciente_id: pacienteId,
      p_clinica_id: clinicaId,
      p_motivo: motivo,
      p_confirmacao: confirmacaoNome,
    }
  );

  if (error) throw new AnonimizacaoLgpdError(codigoDoErro(error));

  const ja = jaAnonimizadoSchema.safeParse(data);
  if (ja.success) {
    return { situacao: 'ja_anonimizado', anonimizadoEm: ja.data.anonimizado_em };
  }

  const resposta = sucessoSchema.safeParse(data);
  if (!resposta.success) throw new AnonimizacaoLgpdError('LGPD_RESPOSTA_INVALIDA');

  const { log_id, rotulo, contagens, pendencias: pendenciasBanco } = resposta.data;
  const pendencias: string[] = [];

  if (pendenciasBanco.foto_url) {
    const { error: erroFoto } = await supabase.storage
      .from(BUCKET_FOTOS_PACIENTE)
      .remove([pendenciasBanco.foto_url]);
    if (erroFoto) {
      pendencias.push(
        'A foto do paciente não foi removida do armazenamento. Remova-a manualmente.'
      );
    }
  }

  if (pendenciasBanco.whatsapp_conversas > 0) {
    pendencias.push(
      `${pendenciasBanco.whatsapp_conversas} conversa(s) de WhatsApp foram desvinculadas, mas as mensagens e o número permanecem. Trate-as manualmente.`
    );
  }

  return { situacao: 'anonimizado', logId: log_id, rotulo, contagens, pendencias };
}
