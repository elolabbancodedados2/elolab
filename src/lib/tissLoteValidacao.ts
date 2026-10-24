import { emCentavos } from '@/lib/dinheiro';

/**
 * Regras de consistência do lote TISS antes de exportar/registrar o envio.
 * Espelha `public.pendencias_lote_tiss` (migration 20261024130000): o banco
 * recusa o envio com erro; esta versão aponta cada guia e campo na tela.
 */

export interface LoteValidacao {
  numero_lote: string;
  competencia: string; // YYYY-MM-01
  versao_tiss: string | null;
  convenio_id: string;
  quantidade_guias: number;
  valor_apresentado: number;
}

export interface GuiaLote {
  id: string;
  numero_guia: string;
  numero_carteira: string | null;
  paciente_id: string | null;
  autorizacao_id: string | null;
  data_atendimento: string;
  codigo_procedimento: string;
  tipo_servico: string;
  quantidade: number;
  valor_total: number;
}

export interface AutorizacaoValidacao {
  id: string;
  status: string;
  convenio_id: string;
  paciente_id: string;
  tipo_servico: string;
  data_expiracao: string | null;
  numero_autorizacao: string | null;
}

export interface PendenciaLote {
  guiaId: string | null;
  numeroGuia: string | null;
  campo: string;
  mensagem: string;
  gravidade: 'erro' | 'aviso';
  tipo: 'consistencia' | 'autorizacao';
}

const brl = (centavos: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100).replace(/\u00a0/g, ' ');
const normalizar = (v: string | null | undefined) => (v ?? '').trim().toLocaleLowerCase('pt-BR');

function fimDoMes(competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

export function validarLoteTiss(entrada: {
  lote: LoteValidacao;
  registroAns: string | null;
  guias: ReadonlyArray<GuiaLote>;
  autorizacoes: ReadonlyArray<AutorizacaoValidacao>;
  hoje: string;
}): PendenciaLote[] {
  const { lote, guias, hoje } = entrada;
  const pendencias: PendenciaLote[] = [];
  const doLote = (campo: string, mensagem: string, gravidade: PendenciaLote['gravidade'] = 'erro') =>
    pendencias.push({ guiaId: null, numeroGuia: null, campo, mensagem, gravidade, tipo: 'consistencia' });

  if (!/^\d{6}$/.test((entrada.registroAns ?? '').trim())) doLote('registro_ans', 'Registro ANS do convênio deve ter 6 dígitos. Corrija o cadastro do convênio.');
  if (!/^\d{2}\.\d{2}\.\d{2}$/.test((lote.versao_tiss ?? '').trim())) doLote('versao_tiss', 'Versão TISS deve seguir o formato 00.00.00.');
  const numero = lote.numero_lote.trim();
  if (!numero || numero.length > 12) doLote('numero_lote', 'Número do lote deve ter de 1 a 12 caracteres.');

  if (guias.length === 0) {
    doLote('guias', 'Lote sem guias detalhadas: a conferência por guia e autorização não pode ser feita.', 'aviso');
  } else {
    if (guias.length !== lote.quantidade_guias) doLote('quantidade_guias', `Quantidade informada (${lote.quantidade_guias}) difere das guias cadastradas (${guias.length}).`);
    const soma = guias.reduce((s, g) => s + emCentavos(g.valor_total), 0);
    if (soma !== emCentavos(lote.valor_apresentado)) doLote('valor_apresentado', `Valor apresentado (${brl(emCentavos(lote.valor_apresentado))}) difere da soma das guias (${brl(soma)}).`);
  }

  const limiteAtendimento = fimDoMes(lote.competencia);
  const vistos = new Set<string>();
  const autorizacoes = new Map(entrada.autorizacoes.map((a) => [a.id, a]));
  for (const g of guias) {
    const daGuia = (campo: string, mensagem: string, tipo: PendenciaLote['tipo'] = 'consistencia', gravidade: PendenciaLote['gravidade'] = 'erro') =>
      pendencias.push({ guiaId: g.id, numeroGuia: g.numero_guia, campo, mensagem, gravidade, tipo });
    const numeroGuia = g.numero_guia.trim();
    if (!numeroGuia || numeroGuia.length > 20) daGuia('numero_guia', 'Número da guia deve ter de 1 a 20 caracteres.');
    else if (vistos.has(numeroGuia)) daGuia('numero_guia', 'Número da guia repetido neste lote.');
    vistos.add(numeroGuia);
    if (!(g.numero_carteira ?? '').trim()) daGuia('numero_carteira', 'Informe a carteira do beneficiário.');
    if (!/^\d{8}$/.test(g.codigo_procedimento.trim())) daGuia('codigo_procedimento', 'Código do procedimento deve ter 8 dígitos (TUSS).');
    if (g.data_atendimento > limiteAtendimento || g.data_atendimento > hoje) daGuia('data_atendimento', 'Data do atendimento é posterior à competência do lote ou futura.');

    if (!g.autorizacao_id) {
      if (normalizar(g.tipo_servico) !== 'consulta') daGuia('autorizacao_id', 'Guia sem autorização vinculada; confira se o convênio exige autorização prévia.', 'autorizacao', 'aviso');
      continue;
    }
    const a = autorizacoes.get(g.autorizacao_id);
    if (!a) { daGuia('autorizacao_id', 'Autorização vinculada não foi encontrada nesta clínica.', 'autorizacao'); continue; }
    const ref = a.numero_autorizacao || 'sem número';
    if (a.status !== 'autorizada') daGuia('autorizacao_status', `Autorização ${ref} está como "${a.status}", não autorizada.`, 'autorizacao');
    if (a.convenio_id !== lote.convenio_id) daGuia('autorizacao_convenio', `Autorização ${ref} pertence a outro convênio.`, 'autorizacao');
    if (g.paciente_id && a.paciente_id !== g.paciente_id) daGuia('paciente_id', `Autorização ${ref} é de outro paciente.`, 'autorizacao');
    if (normalizar(a.tipo_servico) !== normalizar(g.tipo_servico)) daGuia('tipo_servico', `Guia faturada como ${g.tipo_servico}, mas a autorização ${ref} é para ${a.tipo_servico}.`, 'autorizacao');
    if (a.data_expiracao && a.data_expiracao < g.data_atendimento) daGuia('data_atendimento', `Atendimento após a validade da autorização ${ref}.`, 'autorizacao');
  }
  return pendencias;
}

export const bloqueiaEnvio = (pendencias: ReadonlyArray<PendenciaLote>) => pendencias.some((p) => p.gravidade === 'erro');
