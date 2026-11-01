/**
 * Rótulos e formatos compartilhados pelo faturamento de convênios (TISS).
 *
 * As telas mostravam o status cru do banco ("pago_parcial", "recurso_enviado")
 * e a competência como "2026-10". Tudo que a clínica lê passa por aqui.
 */

export const STATUS_LOTE_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', enviado: 'Enviado', processando: 'Processando', pago_parcial: 'Pago parcial',
  pago: 'Pago', rejeitado: 'Rejeitado', cancelado: 'Cancelado',
};

export const STATUS_GLOSA_LABEL: Record<string, string> = {
  pendente: 'Pendente', recurso_preparacao: 'Preparando recurso', recurso_enviado: 'Recurso enviado',
  aceita: 'Aceita', mantida: 'Mantida', cancelada: 'Cancelada',
};

export const STATUS_AUTORIZACAO_LABEL: Record<string, string> = {
  pendente: 'Pendente', solicitada: 'Solicitada', em_analise: 'Em análise', autorizada: 'Autorizada',
  aprovada: 'Autorizada', negada: 'Negada', expirada: 'Expirada', cancelada: 'Cancelada', utilizada: 'Utilizada',
};

export const STATUS_REPASSE_LABEL: Record<string, string> = {
  pendente: 'Pendente', aprovado: 'Aprovado', pago: 'Pago', cancelado: 'Cancelado',
};

/** Rótulo legível de um status; desconhecido vira texto sem sublinhado, com inicial maiúscula. */
export function rotuloStatus(mapa: Record<string, string>, status: string | null | undefined): string {
  if (!status) return '—';
  if (mapa[status]) return mapa[status];
  const texto = status.replace(/_/g, ' ');
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}

export const rotuloStatusLote = (status: string | null | undefined) => rotuloStatus(STATUS_LOTE_LABEL, status);
export const rotuloStatusGlosa = (status: string | null | undefined) => rotuloStatus(STATUS_GLOSA_LABEL, status);
export const rotuloStatusAutorizacao = (status: string | null | undefined) => rotuloStatus(STATUS_AUTORIZACAO_LABEL, status);
export const rotuloStatusRepasse = (status: string | null | undefined) => rotuloStatus(STATUS_REPASSE_LABEL, status);

/** "2026-10-01" ou "2026-10" → "10/2026". Valor inválido devolve "—". */
export function formatarCompetencia(competencia: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(competencia ?? '');
  if (!match) return '—';
  return `${match[2]}/${match[1]}`;
}

/** "2026-10-31" → "31/10/2026". */
export function formatarDataCurta(data: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? '');
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Número do lote no padrão TISS: até 12 caracteres. */
export const TAMANHO_MAXIMO_NUMERO_LOTE = 12;

export function validarNumeroLote(numero: string): string | null {
  const valor = numero.trim();
  if (!valor) return 'Informe o número do lote.';
  if (valor.length > TAMANHO_MAXIMO_NUMERO_LOTE) return `O padrão TISS aceita até ${TAMANHO_MAXIMO_NUMERO_LOTE} caracteres.`;
  if (!/^[0-9A-Za-z-]+$/.test(valor)) return 'Use apenas letras, números e hífen.';
  return null;
}

/**
 * Sugere o próximo número sequencial a partir dos lotes já cadastrados.
 * Considera só números puramente numéricos e preserva os zeros à esquerda
 * do maior deles ("000041" → "000042"). Sem histórico numérico, sugere "1".
 */
export function sugerirProximoNumeroLote(numeros: ReadonlyArray<string | null | undefined>): string {
  let maior: number | null = null;
  let largura = 1;
  for (const bruto of numeros) {
    const numero = (bruto ?? '').trim();
    if (!/^\d{1,12}$/.test(numero)) continue;
    const valor = Number(numero);
    if (maior === null || valor > maior) { maior = valor; largura = numero.length; }
  }
  if (maior === null) return '1';
  const proximo = String(maior + 1);
  if (proximo.length > TAMANHO_MAXIMO_NUMERO_LOTE) return '';
  return proximo.padStart(largura, '0');
}

/** Registro ANS da operadora: vazio (ainda não informado) ou exatamente 6 dígitos. */
export function validarRegistroAns(registro: string | null | undefined): string | null {
  const valor = (registro ?? '').trim();
  if (!valor) return null;
  if (!/^\d{6}$/.test(valor)) return 'O registro ANS tem exatamente 6 dígitos.';
  return null;
}

/** Mantém só dígitos e corta em 6, para a máscara do campo. */
export const mascararRegistroAns = (valor: string) => valor.replace(/\D/g, '').slice(0, 6);

/**
 * Motivos de glosa mais frequentes da tabela de domínio TISS 38
 * ("Mensagens: glosas, negativas e outras"). É uma lista de apoio: o campo
 * continua aceitando qualquer código do demonstrativo da operadora.
 */
export const MOTIVOS_GLOSA_TISS: ReadonlyArray<{ codigo: string; descricao: string }> = [
  { codigo: '1001', descricao: 'Número da carteira inválido' },
  { codigo: '1005', descricao: 'Atendimento anterior à inclusão do beneficiário' },
  { codigo: '1006', descricao: 'Atendimento após o desligamento do beneficiário' },
  { codigo: '1007', descricao: 'Atendimento dentro da carência do beneficiário' },
  { codigo: '1009', descricao: 'Beneficiário com pagamento em aberto' },
  { codigo: '1013', descricao: 'Cadastro do beneficiário com problemas' },
  { codigo: '1017', descricao: 'Data de validade da carteira vencida' },
  { codigo: '1201', descricao: 'Atendimento fora da vigência do contrato com o prestador' },
  { codigo: '1304', descricao: 'Cobrança em guia indevida' },
  { codigo: '1305', descricao: 'Item pago em outra guia' },
  { codigo: '1308', descricao: 'Guia já apresentada' },
  { codigo: '1316', descricao: 'Guia com local de atendimento preenchido incorretamente' },
  { codigo: '1317', descricao: 'Guia sem data do atendimento' },
  { codigo: '1321', descricao: 'Validade da guia expirada' },
  { codigo: '1323', descricao: 'Data preenchida incorretamente' },
  { codigo: '1801', descricao: 'Procedimento inválido' },
  { codigo: '1802', descricao: 'Procedimento incompatível com o sexo do beneficiário' },
  { codigo: '1806', descricao: 'Quantidade de procedimento deve ser maior que zero' },
];

export function descricaoMotivoGlosa(codigo: string): string | null {
  return MOTIVOS_GLOSA_TISS.find(item => item.codigo === codigo.trim())?.descricao ?? null;
}
