import { parseDateOnly } from '@/lib/dateOnly';

/**
 * Detalhes de emissão de documentos clínicos (local, data e CRM), sem
 * inventar dados: o que não estiver configurado fica de fora do documento.
 */

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

/**
 * Extrai "Cidade/UF" de um endereço livre, como o cadastrado em Configurações
 * ("Rua X, 100, Centro, Campinas - SP, 13000-000"). Sem padrão reconhecível,
 * devolve null em vez de chutar.
 */
export function extrairCidadeUf(endereco: string | null | undefined): { cidade: string; uf: string } | null {
  if (!endereco) return null;
  const semCep = endereco.replace(/\b\d{5}-?\d{3}\b/g, ' ');
  const padrao = /([A-Za-zÀ-ÿ'][A-Za-zÀ-ÿ' .]*?)\s*[-/–]\s*([A-Za-z]{2})\b/g;
  let encontrado: { cidade: string; uf: string } | null = null;
  for (const match of semCep.matchAll(padrao)) {
    const uf = match[2].toUpperCase();
    if (!UFS.has(uf)) continue;
    // A cidade é o último trecho antes do traço, depois da última vírgula.
    const cidade = match[1].split(',').pop()!.trim();
    if (cidade.length >= 2) encontrado = { cidade, uf };
  }
  return encontrado;
}

/** "Campinas/SP, 3 de março de 2026." — ou só a data, sem cidade conhecida. */
export function linhaLocalEData(
  dataEmissao: string,
  local: { cidade?: string | null; uf?: string | null; endereco?: string | null },
): string {
  const data = parseDateOnly(dataEmissao);
  const dataTexto = data && !Number.isNaN(data.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(data)
    : null;
  const cidade = local.cidade?.trim()
    ? { cidade: local.cidade.trim(), uf: (local.uf || '').trim().toUpperCase() }
    : extrairCidadeUf(local.endereco);
  const prefixo = cidade ? `${cidade.cidade}${cidade.uf ? `/${cidade.uf}` : ''}, ` : '';
  if (!dataTexto) return prefixo ? prefixo.replace(/, $/, '.') : '';
  return `${prefixo}${dataTexto}.`;
}

/** "CRM-SP 12345 | Cardiologia" — sem "N/A" quando falta o CRM. */
export function linhaCrmMedico(medico: { crm?: string | null; crmUf?: string | null; especialidade?: string | null; rqe?: string | null }): string {
  const uf = (medico.crmUf || '').trim().toUpperCase();
  const crm = (medico.crm || '').trim();
  return [
    crm ? `CRM${uf ? `-${uf}` : ''} ${crm}` : null,
    medico.rqe ? `RQE ${medico.rqe}` : null,
    medico.especialidade?.trim() || null,
  ].filter(Boolean).join(' | ');
}
