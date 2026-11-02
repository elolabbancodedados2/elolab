import { supabase } from '@/integrations/supabase/client';
import { ageFromDateOnly, isValidDateOnly } from '@/lib/dateOnly';

/** Documentos impressos no balcão: declaração de comparecimento e etiqueta térmica. */

export interface DadosDeclaracao {
  nomeCivil: string;
  nomeSocial?: string | null;
  /** Data do atendimento, AAAA-MM-DD. */
  data: string;
  horaChegada?: string | null;
  horaSaida?: string | null;
  clinicaNome?: string | null;
  profissional?: string | null;
}

const dataPorExtenso = (data: string) => {
  if (!isValidDateOnly(data)) return data;
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(ano, mes - 1, dia)));
};

/**
 * Texto da declaração. Com nome social, ele vem primeiro e o civil aparece
 * entre parênteses, como pede o Decreto 8.727/2016 para documentos.
 */
export function textoDeclaracaoComparecimento(dados: DadosDeclaracao): string {
  const nomeSocial = dados.nomeSocial?.trim();
  const nome = nomeSocial && nomeSocial !== dados.nomeCivil.trim()
    ? `${nomeSocial} (nome civil: ${dados.nomeCivil.trim()})`
    : dados.nomeCivil.trim();
  const local = dados.clinicaNome?.trim() ? ` em ${dados.clinicaNome.trim()}` : ' nesta unidade';
  const periodo = dados.horaChegada && dados.horaSaida
    ? `, das ${dados.horaChegada} às ${dados.horaSaida}`
    : dados.horaChegada
      ? `, a partir das ${dados.horaChegada}`
      : '';
  const comQuem = dados.profissional?.trim() ? `, para atendimento com ${dados.profissional.trim()}` : ', para atendimento de saúde';
  return `Declaramos, para os devidos fins, que ${nome} esteve presente${local} no dia ${dataPorExtenso(dados.data)}${periodo}${comQuem}.`;
}

function abrirPdf(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const janela = window.open(url, '_blank');
  if (!janela) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export async function buscarNomeClinica(clinicaId: string | null | undefined): Promise<string | null> {
  if (!clinicaId) return null;
  try {
    const { data } = await supabase.from('clinicas').select('nome').eq('id', clinicaId).maybeSingle();
    return (data as { nome?: string | null } | null)?.nome ?? null;
  } catch {
    return null;
  }
}

/** Abre a declaração em PDF numa aba nova. Devolve false se o navegador bloquear a janela. */
export async function imprimirDeclaracaoComparecimento(dados: DadosDeclaracao): Promise<boolean> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Declaração de comparecimento', 105, 40, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const linhas = doc.splitTextToSize(textoDeclaracaoComparecimento(dados), 160) as string[];
  doc.text(linhas, 25, 65, { lineHeightFactor: 1.6 });
  doc.text(`${dados.clinicaNome?.trim() || 'Clínica'}, ${dataPorExtenso(dados.data)}.`, 25, 120);
  doc.line(55, 160, 155, 160);
  doc.setFontSize(10);
  doc.text('Assinatura e carimbo', 105, 166, { align: 'center' });
  return abrirPdf(doc.output('blob'));
}

export interface DadosEtiqueta {
  nome: string;
  dataNascimento?: string | null;
  convenio?: string | null;
  carteirinha?: string | null;
  /** Data de referência para a idade (padrão: hoje). */
  hoje?: Date;
}

/** Linhas da etiqueta 50×25 mm, já cortadas para caber na largura. */
export function linhasEtiqueta(dados: DadosEtiqueta): string[] {
  const cortar = (texto: string, limite: number) => (texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto);
  const linhas = [cortar(dados.nome.trim(), 28)];
  if (dados.dataNascimento && isValidDateOnly(dados.dataNascimento)) {
    const [ano, mes, dia] = dados.dataNascimento.split('-');
    const idade = ageFromDateOnly(dados.dataNascimento, dados.hoje);
    linhas.push(`Nasc. ${dia}/${mes}/${ano} · ${idade} ${idade === 1 ? 'ano' : 'anos'}`);
  }
  linhas.push(cortar(dados.convenio?.trim() ? `Convênio: ${dados.convenio.trim()}` : 'Particular', 32));
  if (dados.carteirinha?.trim()) linhas.push(cortar(`Cart.: ${dados.carteirinha.trim()}`, 32));
  return linhas;
}

/** Etiqueta para impressora térmica 50×25 mm. */
export async function imprimirEtiquetaTermica(dados: DadosEtiqueta): Promise<boolean> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: [50, 25], orientation: 'landscape' });
  const [nome, ...resto] = linhasEtiqueta(dados);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(nome, 2.5, 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  resto.forEach((linha, indice) => doc.text(linha, 2.5, 10 + indice * 4));
  return abrirPdf(doc.output('blob'));
}
