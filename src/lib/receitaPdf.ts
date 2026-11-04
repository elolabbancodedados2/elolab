import type jsPDF from 'jspdf';
import { ptBR } from 'date-fns/locale';
import { formatWithDatePreference as format } from './datePreference';

async function imageToDataUrl(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ─── PDF Builder ─── */
export type TipoReceita = 'simples' | 'controle_especial' | 'antimicrobiano';

const TITULO_RECEITA: Record<TipoReceita, string> = {
  simples: 'RECEITUÁRIO MÉDICO',
  controle_especial: 'RECEITUÁRIO DE CONTROLE ESPECIAL',
  antimicrobiano: 'RECEITUÁRIO DE ANTIMICROBIANO',
};

export const tipoDeReceita = (valor: unknown): TipoReceita =>
  valor === 'controle_especial' || valor === 'antimicrobiano' ? valor : 'simples';

/**
 * Controle especial (Portaria SVS/MS 344/1998) e antimicrobiano (RDC 471/2021)
 * saem em duas vias: a primeira fica retida na farmácia e a segunda volta com
 * o paciente. A receita simples continua em via única.
 */
const VIAS_RECEITA: Record<TipoReceita, string[]> = {
  simples: [''],
  controle_especial: ['1ª via — retenção da farmácia', '2ª via — orientação ao paciente'],
  antimicrobiano: ['1ª via — retenção da farmácia', '2ª via — paciente'],
};

/** Endereço do paciente para o receituário de controle especial. */
export const enderecoDoPaciente = (paciente: Record<string, any> | null | undefined): string | undefined => {
  if (!paciente) return undefined;
  const rua = [paciente.logradouro, paciente.numero].filter(Boolean).join(', ');
  const cidade = [paciente.cidade, paciente.estado].filter(Boolean).join('/');
  return [rua, paciente.bairro, cidade].filter(Boolean).join(' — ') || undefined;
};

export async function buildReceitaPdf(data: {
  pacienteNome: string;
  cpf: string;
  dataEmissao: string;
  medicoNome: string;
  crm: string;
  especialidade: string;
  medicamentosTexto: string;
  tipo?: TipoReceita;
  pacienteEndereco?: string;
  clinicaNome?: string;
  clinicaEndereco?: string;
  clinicaTelefone?: string;
  clinicaCnpj?: string;
  clinicaCnes?: string;
  logoUrl?: string;
  rodapeReceita?: string;
  mostrarLogo?: boolean;
  mostrarCRM?: boolean;
  mostrarCNES?: boolean;
  /** Prévia antes de emitir: marca todas as páginas e não tem validade. */
  previa?: boolean;
}): Promise<jsPDF> {
  // Carrega as ~660 KB do jsPDF só quando o médico gera a receita,
  // em vez de ao abrir a tela.
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const w = 210;
  const margin = 20;
  const tipo = tipoDeReceita(data.tipo);
  const logoDataUrl = data.mostrarLogo === false ? null : await imageToDataUrl(data.logoUrl);

  // Preto e grafite: o azul antigo saiu do padrão e some em impressão P&B.
  const desenharVia = (via: string) => {
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', margin, 14, 24, 24, undefined, 'FAST'); } catch { /* logo opcional */ }
    }

    // ── Border ──
    doc.setDrawColor(60);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, w - 20, 277);

    // ── Header / letterhead ──
    doc.setFontSize(18);
    doc.setTextColor(17, 18, 20);
    doc.setFont('helvetica', 'bold');
    doc.text(data.clinicaNome || 'Clínica Médica', w / 2, 25, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(9);
    doc.setTextColor(90);
    if (data.clinicaEndereco) doc.text(data.clinicaEndereco, w / 2, 31, { align: 'center' });
    const contato = [data.clinicaTelefone && `Tel: ${data.clinicaTelefone}`, data.clinicaCnpj && `CNPJ: ${data.clinicaCnpj}`].filter(Boolean).join(' | ');
    if (contato) doc.text(contato, w / 2, 36, { align: 'center' });
    if (data.mostrarCNES && data.clinicaCnes) {
      doc.text(`CNES: ${data.clinicaCnes}`, w / 2, 40, { align: 'center' });
    }

    doc.setDrawColor(60);
    doc.setLineWidth(0.4);
    doc.line(margin, 42, w - margin, 42);

    // ── Title ──
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(TITULO_RECEITA[tipo], w / 2, 52, { align: 'center' });
    if (via) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(70);
      doc.text(via, w / 2, 57, { align: 'center' });
      doc.setTextColor(0);
    }

    // ── Patient info ──
    let y = via ? 66 : 64;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const addField = (label: string, value: string) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, margin + doc.getTextWidth(label) + 2, y);
      y += 6;
    };

    addField('Paciente: ', data.pacienteNome);
    if (data.cpf) addField('CPF: ', data.cpf);
    if (tipo === 'controle_especial') addField('Endereço: ', data.pacienteEndereco || '________________________________________________');
    addField('Data: ', data.dataEmissao);

    y += 4;
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(margin, y, w - margin, y);
    y += 8;

    // ── Medications ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Medicamentos e posologia', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const limiteTexto = tipo === 'controle_especial' ? 190 : 240;
    const lines = doc.splitTextToSize(data.medicamentosTexto, w - margin * 2);
    for (const line of lines) {
      if (y > limiteTexto) {
        doc.addPage();
        y = 25;
      }
      doc.text(line, margin, y);
      y += 5.5;
    }

    // ── Doctor signature area ──
    y = Math.max(y + 20, tipo === 'controle_especial' ? 196 : 210);
    if (y > 250) { doc.addPage(); y = 60; }

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(w / 2 - 40, y, w / 2 + 40, y);
    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(data.medicoNome, w / 2, y, { align: 'center' });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (data.mostrarCRM !== false && data.crm) {
      doc.text(`CRM: ${data.crm}${data.especialidade ? ` — ${data.especialidade}` : ''}`, w / 2, y, { align: 'center' });
    }

    // ── Controle especial: identificação do comprador e do fornecedor ──
    if (tipo === 'controle_especial') {
      const topo = Math.max(y + 8, 222);
      const largura = (w - margin * 2 - 6) / 2;
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.rect(margin, topo, largura, 42);
      doc.rect(margin + largura + 6, topo, largura, 42);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('IDENTIFICAÇÃO DO COMPRADOR', margin + 2, topo + 5);
      doc.text('IDENTIFICAÇÃO DO FORNECEDOR', margin + largura + 8, topo + 5);
      doc.setFont('helvetica', 'normal');
      ['Nome:', 'RG:            Órgão emissor:', 'Endereço:', 'Cidade:            UF:', 'Telefone:'].forEach((rotulo, indice) => {
        doc.text(rotulo, margin + 2, topo + 12 + indice * 6);
      });
      ['', 'Assinatura do farmacêutico', '', 'Data:     /     /'].forEach((rotulo, indice) => {
        if (rotulo) doc.text(rotulo, margin + largura + 8, topo + 18 + indice * 7);
      });
    }

    // ── Rodapé ──
    // O texto nunca afirma assinatura digital: o PDF é gerado antes de
    // qualquer assinatura, e o médico assina depois (gov.br ou de próprio punho).
    const footerY = 280;
    doc.setFontSize(7);
    doc.setTextColor(110);
    if (data.rodapeReceita?.trim()) {
      const customFooter = doc.splitTextToSize(data.rodapeReceita.trim(), w - margin * 2).slice(0, 2);
      customFooter.forEach((line: string, index: number) => doc.text(line, w / 2, footerY - 8 + index * 3, { align: 'center' }));
    }
    doc.text(
      'Documento sem assinatura digital. Assine no portal gov.br ou de próprio punho para ter validade.',
      w / 2, footerY, { align: 'center' },
    );
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      w / 2, footerY + 4, { align: 'center' },
    );
    doc.setTextColor(0);
  };

  VIAS_RECEITA[tipo].forEach((via, indice) => {
    if (indice > 0) doc.addPage();
    desenharVia(via);
  });

  if (data.previa) {
    const { marcarComoPrevia } = await import('@/lib/pdfGenerator');
    marcarComoPrevia(doc);
  }

  return doc;
}
