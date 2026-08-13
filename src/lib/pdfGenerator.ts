// `import type` é apagado na compilação: dá o tipo sem puxar as ~660 KB do
// jsPDF para o bundle de quem só precisa da assinatura da função.
import type jsPDF from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import QRCode from 'qrcode';

import { supabase } from '@/integrations/supabase/client';

/**
 * Carrega jsPDF e jspdf-autotable só quando alguém vai realmente gerar um PDF.
 *
 * Antes eram `import` estáticos no topo. Como este módulo é importado por
 * prescrições, atestados, prontuários, laudos, relatórios e etiquetas, o chunk
 * `export-vendor` (664 KB) mais o `html2canvas` (200 KB, que o jsPDF arrasta e
 * ninguém usa — não há nenhuma chamada a `doc.html()` no projeto) baixavam ao
 * ABRIR qualquer uma dessas telas, mesmo que o usuário nunca clicasse em
 * imprimir. Num computador de recepção com internet ruim isso é quase 1 MB de
 * espera antes de a tela aparecer.
 *
 * O módulo fica em cache depois da primeira carga, então gerar o segundo PDF
 * não paga o custo de novo.
 */
let _pdfLib: {
  JsPDF: typeof jsPDF;
  autoTable: (doc: jsPDF, options: UserOptions) => void;
} | null = null;

async function carregarPdfLib() {
  if (!_pdfLib) {
    const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    _pdfLib = { JsPDF, autoTable: autoTable as any };
  }
  return _pdfLib;
}

interface ClinicaInfo {
  nome: string;
  endereco: string;
  telefone: string;
  cnpj: string;
  logoUrl?: string;
}

const DEFAULT_CLINICA: ClinicaInfo = {
  nome: 'EloLab Clínica Médica',
  endereco: 'Av. Principal, 1000 - Centro - São Paulo/SP',
  telefone: '(11) 3000-0000',
  cnpj: '00.000.000/0001-00',
};

let _cachedClinica: ClinicaInfo | null = null;
let _cacheTime = 0;

export async function getClinicaInfo(): Promise<ClinicaInfo> {
  // Cache for 5 minutes
  if (_cachedClinica && Date.now() - _cacheTime < 5 * 60 * 1000) {
    return _cachedClinica;
  }

  try {
    const { data: configs } = await supabase
      .from('configuracoes_clinica')
      .select('chave, valor')
      .in('chave', ['clinica_info', 'clinica_logo']);

    if (configs && configs.length > 0) {
      const infoConfig = configs.find(c => c.chave === 'clinica_info');
      const logoConfig = configs.find(c => c.chave === 'clinica_logo');
      
      const info = infoConfig?.valor as any;
      _cachedClinica = {
        nome: info?.nome || DEFAULT_CLINICA.nome,
        endereco: info?.endereco || DEFAULT_CLINICA.endereco,
        telefone: info?.telefone || DEFAULT_CLINICA.telefone,
        cnpj: info?.cnpj || DEFAULT_CLINICA.cnpj,
        logoUrl: (logoConfig?.valor as any)?.url || info?.logoUrl || undefined,
      };
    } else {
      _cachedClinica = { ...DEFAULT_CLINICA };
    }
  } catch {
    _cachedClinica = { ...DEFAULT_CLINICA };
  }

  _cacheTime = Date.now();
  return _cachedClinica;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Header padrão para documentos - agora com logo dinâmico
async function addHeader(doc: jsPDF, titulo: string, clinica?: ClinicaInfo) {
  const info = clinica || await getClinicaInfo();
  let startY = 20;

  // Try to add logo
  if (info.logoUrl) {
    const logoBase64 = await loadImageAsBase64(info.logoUrl);
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 15, 10, 25, 25);
        startY = 18;
      } catch {
        // Logo failed to load, continue without it
      }
    }
  }

  doc.setFontSize(18);
  doc.setTextColor(0, 102, 204);
  doc.text(info.nome, 105, startY, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(info.endereco, 105, startY + 8, { align: 'center' });
  doc.text(`Tel: ${info.telefone} | CNPJ: ${info.cnpj}`, 105, startY + 14, { align: 'center' });

  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.5);
  doc.line(20, startY + 20, 190, startY + 20);

  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(titulo, 105, startY + 30, { align: 'center' });
}

// Footer padrão
function addFooter(doc: jsPDF, pageNum: number = 1) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - Página ${pageNum}`,
    105,
    pageHeight - 10,
    { align: 'center' }
  );
}

// Gerar receita médica
export async function gerarReceita(
  paciente: { nome: string; cpf?: string; dataNascimento?: string },
  medico: { nome: string; crm?: string; especialidade?: string },
  medicamentos: Array<{
    nome: string;
    dosagem: string;
    via: string;
    frequencia: string;
    duracao: string;
    quantidade: string;
    observacoes?: string;
  }>,
  orientacoes: string,
  tipo: 'simples' | 'controle_especial' | 'antimicrobiano' = 'simples'
) {
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF();

  const tipoLabel = {
    simples: 'RECEITUÁRIO SIMPLES',
    controle_especial: 'RECEITUÁRIO DE CONTROLE ESPECIAL',
    antimicrobiano: 'RECEITUÁRIO DE ANTIMICROBIANOS',
  };

  addHeader(doc, tipoLabel[tipo]);

  // Data e número
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy')}`, 20, 60);
  doc.text(`Nº: ${Math.random().toString(36).substr(2, 9).toUpperCase()}`, 170, 60, { align: 'right' });

  // Dados do paciente
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PACIENTE', 20, 75);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nome: ${paciente.nome}`, 20, 82);
  if (paciente.cpf) doc.text(`CPF: ${paciente.cpf}`, 120, 82);
  if (paciente.dataNascimento) {
    doc.text(`Data Nasc.: ${format(new Date(paciente.dataNascimento), 'dd/MM/yyyy')}`, 20, 89);
  }

  // Linha separadora
  doc.line(20, 95, 190, 95);

  // Medicamentos
  let yPos = 105;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PRESCRIÇÃO', 20, yPos);
  yPos += 10;

  medicamentos.forEach((med, index) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${index + 1}. ${med.nome} ${med.dosagem}`, 25, yPos);
    yPos += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Via: ${med.via} | ${med.frequencia} | ${med.duracao}`, 30, yPos);
    yPos += 5;
    doc.text(`Quantidade: ${med.quantidade}`, 30, yPos);
    yPos += 5;

    if (med.observacoes) {
      doc.text(`Obs: ${med.observacoes}`, 30, yPos);
      yPos += 5;
    }
    yPos += 5;

    if (yPos > 230) {
      doc.addPage();
      yPos = 30;
    }
  });

  // Orientações
  if (orientacoes) {
    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ORIENTAÇÕES:', 20, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(orientacoes, 160);
    doc.text(lines, 20, yPos);
  }

  // QR Code de validação
  const qrData = JSON.stringify({
    tipo: tipoLabel[tipo],
    paciente: paciente.nome,
    medico: medico.nome,
    crm: medico.crm,
    data: format(new Date(), 'yyyy-MM-dd'),
    medicamentos: medicamentos.map(m => m.nome).join(', '),
    hash: Math.random().toString(36).substr(2, 12).toUpperCase(),
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, { width: 80, margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', 160, 240, 25, 25);
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text('Validação digital', 172.5, 267, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  } catch { /* QR generation failed silently */ }

  // Assinatura do médico
  const assinaturaY = 250;
  doc.line(40, assinaturaY, 140, assinaturaY);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(medico.nome, 90, assinaturaY + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CRM: ${medico.crm || 'N/A'} | ${medico.especialidade || ''}`, 90, assinaturaY + 12, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  // "pendente" sugeria um processo de assinatura em andamento no sistema, que
  // não existe: não há integração com ICP-Brasil em lugar nenhum do app.
  doc.text('Assine acima ou pelo assinador gov.br', 90, assinaturaY + 17, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  addFooter(doc);

  return doc;
}

// Gerar atestado médico
export async function gerarAtestado(
  paciente: { nome: string; cpf?: string },
  medico: { nome: string; crm?: string; especialidade?: string },
  atestado: {
    tipo: 'comparecimento' | 'afastamento' | 'aptidao' | 'acompanhante';
    dataAtendimento: string;
    diasAfastamento?: number;
    cid?: string;
    observacoes?: string;
  }
) {
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF();

  const tipoTitulo = {
    comparecimento: 'ATESTADO DE COMPARECIMENTO',
    afastamento: 'ATESTADO MÉDICO',
    aptidao: 'ATESTADO DE APTIDÃO FÍSICA',
    acompanhante: 'DECLARAÇÃO DE ACOMPANHANTE',
  };

  addHeader(doc, tipoTitulo[atestado.tipo]);

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  let texto = '';
  const dataAtend = format(new Date(atestado.dataAtendimento), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  switch (atestado.tipo) {
    case 'comparecimento':
      texto = `Atesto para os devidos fins que ${paciente.nome}${paciente.cpf ? `, CPF: ${paciente.cpf}` : ''}, compareceu a esta clínica no dia ${dataAtend} para consulta médica.`;
      break;
    case 'afastamento':
      texto = `Atesto para os devidos fins que ${paciente.nome}${paciente.cpf ? `, CPF: ${paciente.cpf}` : ''}, esteve sob meus cuidados profissionais no dia ${dataAtend} e necessita de afastamento de suas atividades por ${atestado.diasAfastamento || 1} dia(s), a partir desta data.`;
      if (atestado.cid) {
        texto += `\n\nCID-10: ${atestado.cid}`;
      }
      break;
    case 'aptidao':
      texto = `Atesto para os devidos fins que ${paciente.nome}${paciente.cpf ? `, CPF: ${paciente.cpf}` : ''}, foi submetido(a) a exame clínico nesta data e encontra-se APTO(A) para exercer suas atividades físicas e/ou laborais.`;
      break;
    case 'acompanhante':
      texto = `Declaro para os devidos fins que ${paciente.nome}${paciente.cpf ? `, CPF: ${paciente.cpf}` : ''}, acompanhou paciente sob meus cuidados nesta clínica no dia ${dataAtend}.`;
      break;
  }

  // Texto do atestado
  const lines = doc.splitTextToSize(texto, 160);
  doc.text(lines, 25, 75);

  // Observações
  if (atestado.observacoes) {
    const obsY = 75 + lines.length * 6 + 15;
    doc.setFont('helvetica', 'bold');
    doc.text('Observações:', 25, obsY);
    doc.setFont('helvetica', 'normal');
    const obsLines = doc.splitTextToSize(atestado.observacoes, 160);
    doc.text(obsLines, 25, obsY + 7);
  }

  // Data e local
  doc.text(`São Paulo, ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.`, 25, 180);

  // Assinatura
  doc.line(60, 220, 150, 220);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(medico.nome, 105, 227, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CRM: ${medico.crm || 'N/A'} | ${medico.especialidade || ''}`, 105, 233, { align: 'center' });

  addFooter(doc);

  return doc;
}

// Gerar relatório financeiro
export async function gerarRelatorioFinanceiro(
  dados: {
    periodo: string;
    receitas: number;
    despesas: number;
    lucro: number;
    lancamentos: Array<{
      data: string;
      tipo: string;
      categoria: string;
      descricao: string;
      valor: number;
      status: string;
    }>;
  }
) {
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF();

  addHeader(doc, 'RELATÓRIO FINANCEIRO');

  // Período
  doc.setFontSize(10);
  doc.text(`Período: ${dados.periodo}`, 20, 60);

  // Resumo
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO', 20, 75);

  const resumoData = [
    ['Total de Receitas', formatCurrency(dados.receitas)],
    ['Total de Despesas', formatCurrency(dados.despesas)],
    ['Lucro/Prejuízo', formatCurrency(dados.lucro)],
  ];

  autoTable(doc, {
    startY: 80,
    head: [['Indicador', 'Valor']],
    body: resumoData,
    theme: 'grid',
    headStyles: { fillColor: [0, 102, 204] },
    margin: { left: 20, right: 20 },
    tableWidth: 80,
  });

  // Detalhamento
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHAMENTO', 20, (doc as any).lastAutoTable.finalY + 15);

  const detalhes = dados.lancamentos.map((l) => [
    l.data,
    l.tipo.toUpperCase(),
    l.categoria,
    l.descricao,
    formatCurrency(l.valor),
    l.status.toUpperCase(),
  ]);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Status']],
    body: detalhes,
    theme: 'striped',
    headStyles: { fillColor: [0, 102, 204], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    margin: { left: 20, right: 20 },
  });

  addFooter(doc);

  return doc;
}

// Gerar etiqueta de paciente
export async function gerarEtiquetaPaciente(
  pacientes: Array<{
    nome: string;
    cpf: string;
    dataNascimento: string;
    telefone: string;
    convenio?: string;
    numeroCarteira?: string;
  }>,
  tamanho: 'pequena' | 'media' | 'grande' = 'media'
) {
  const sizes = {
    pequena: { width: 80, height: 30, fontSize: 7 },
    media: { width: 100, height: 40, fontSize: 8 },
    grande: { width: 120, height: 50, fontSize: 9 },
  };

  const size = sizes[tamanho];
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [size.width, size.height],
  });

  pacientes.forEach((paciente, index) => {
    if (index > 0) {
      doc.addPage([size.width, size.height], 'landscape');
    }

    doc.setFontSize(size.fontSize + 2);
    doc.setFont('helvetica', 'bold');
    doc.text(paciente.nome.toUpperCase(), 3, 8);

    doc.setFontSize(size.fontSize);
    doc.setFont('helvetica', 'normal');
    doc.text(`CPF: ${paciente.cpf}`, 3, 14);
    doc.text(`Nasc: ${format(new Date(paciente.dataNascimento), 'dd/MM/yyyy')}`, 3, 19);
    doc.text(`Tel: ${paciente.telefone}`, 3, 24);

    if (paciente.convenio) {
      doc.text(`Conv: ${paciente.convenio}`, 3, 29);
      if (paciente.numeroCarteira) {
        doc.text(`Cart: ${paciente.numeroCarteira}`, 3, 34);
      }
    }
  });

  return doc;
}

// Gerar PDF do prontuário completo (Super Prontuário)
export async function gerarProntuarioPDF(
  paciente: {
    nome: string; cpf?: string; dataNascimento?: string; alergias?: string[];
    telefone?: string; email?: string; sexo?: string; convenio?: string;
    numeroCarteira?: string; nomeResponsavel?: string;
  },
  medico: { nome: string; crm?: string; especialidade?: string; rqe?: string; crmUf?: string },
  prontuario: {
    data: string;
    queixaPrincipal?: string;
    historiaDoencaAtual?: string;
    historiaPatologicaPregressa?: string;
    historiaFamiliar?: string;
    historiaSocial?: string;
    revisaoSistemas?: string;
    alergiasRelatadas?: string;
    medicamentosEmUso?: string;
    examesFisicos?: string;
    exameCabecaPescoco?: string;
    exameTorax?: string;
    exameAbdomen?: string;
    exameMembros?: string;
    exameNeurologico?: string;
    examePele?: string;
    hipoteseDiagnostica?: string;
    diagnosticoPrincipal?: string;
    diagnosticosSecundarios?: string[];
    conduta?: string;
    planoTerapeutico?: string;
    orientacoesPaciente?: string;
    sinaisVitais?: Record<string, string>;
  },
  prescricoes: Array<{ medicamento: string; dosagem?: string; posologia?: string; duracao?: string; quantidade?: string; observacoes?: string }> = []
) {
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 0;

  // ─── Beautiful Header ───
  // Top accent bar
  doc.setFillColor(0, 153, 102); // brand green
  doc.rect(0, 0, pageWidth, 6, 'F');

  doc.setFontSize(16);
  doc.setTextColor(0, 102, 68);
  doc.setFont('helvetica', 'bold');
  doc.text(DEFAULT_CLINICA.nome, pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');
  doc.text(DEFAULT_CLINICA.endereco, pageWidth / 2, 24, { align: 'center' });
  doc.text(`Tel: ${DEFAULT_CLINICA.telefone} | CNPJ: ${DEFAULT_CLINICA.cnpj}`, pageWidth / 2, 29, { align: 'center' });

  // Title bar
  doc.setFillColor(240, 248, 245);
  doc.roundedRect(margin, 34, contentWidth, 12, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setTextColor(0, 102, 68);
  doc.setFont('helvetica', 'bold');
  doc.text('PRONTUÁRIO DE ATENDIMENTO', pageWidth / 2, 42, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Data: ${formatDateBR(prontuario.data)}`, margin + 2, 42);
  doc.text(`Nº ${Math.random().toString(36).substr(2, 8).toUpperCase()}`, pageWidth - margin - 2, 42, { align: 'right' });

  yPos = 52;

  // ─── Helper: Section title ───
  const addSectionTitle = (title: string, y: number): number => {
    if (y > 260) { doc.addPage(); y = 20; addPageAccent(doc); }
    doc.setFillColor(0, 153, 102);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10);
    doc.setTextColor(0, 80, 55);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 6, y + 5.5);
    return y + 10;
  };

  const addTextField = (label: string, value: string | undefined, y: number): number => {
    if (!value) return y;
    if (y > 255) { doc.addPage(); y = 20; addPageAccent(doc); }
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', margin + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(value, contentWidth - 4);
    doc.text(lines, margin + 2, y + 4.5);
    return y + 4.5 + lines.length * 3.8 + 2;
  };

  // ─── Patient data box ───
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(margin, yPos, contentWidth, 28, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Paciente: ${paciente.nome}`, margin + 4, yPos + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  let infoLine = '';
  if (paciente.cpf) infoLine += `CPF: ${paciente.cpf}  `;
  if (paciente.dataNascimento) infoLine += `Nasc: ${formatDateBR(paciente.dataNascimento)}  `;
  if (paciente.sexo) infoLine += `Sexo: ${paciente.sexo === 'masculino' ? 'M' : paciente.sexo === 'feminino' ? 'F' : 'Outro'}  `;
  doc.text(infoLine, margin + 4, yPos + 12);

  let infoLine2 = '';
  if (paciente.telefone) infoLine2 += `Tel: ${paciente.telefone}  `;
  if (paciente.email) infoLine2 += `Email: ${paciente.email}  `;
  if (paciente.convenio) infoLine2 += `Convênio: ${paciente.convenio}  `;
  if (paciente.numeroCarteira) infoLine2 += `Carteira: ${paciente.numeroCarteira}`;
  if (infoLine2) doc.text(infoLine2, margin + 4, yPos + 17);

  if (paciente.nomeResponsavel) {
    doc.text(`Responsável: ${paciente.nomeResponsavel}`, margin + 4, yPos + 22);
  }

  // Allergy warning
  if (paciente.alergias && paciente.alergias.length > 0) {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(239, 68, 68);
    doc.roundedRect(margin, yPos + 29, contentWidth, 8, 1, 1, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.text(`⚠ ALERGIAS: ${paciente.alergias.join(', ')}`, margin + 4, yPos + 34);
    yPos += 40;
  } else {
    yPos += 32;
  }

  // ─── Vital Signs table ───
  const sv = prontuario.sinaisVitais;
  if (sv && Object.values(sv).some(v => v)) {
    yPos = addSectionTitle('SINAIS VITAIS', yPos);
    const vitalsData: string[][] = [];
    if (sv.pressao_sistolica) vitalsData.push(['PA', `${sv.pressao_sistolica}/${sv.pressao_diastolica || '?'} mmHg`]);
    if (sv.frequencia_cardiaca) vitalsData.push(['FC', `${sv.frequencia_cardiaca} bpm`]);
    if (sv.frequencia_respiratoria) vitalsData.push(['FR', `${sv.frequencia_respiratoria} irpm`]);
    if (sv.temperatura) vitalsData.push(['Temp', `${sv.temperatura} °C`]);
    if (sv.saturacao) vitalsData.push(['SpO₂', `${sv.saturacao}%`]);
    if (sv.peso) vitalsData.push(['Peso', `${sv.peso} kg`]);
    if (sv.altura) vitalsData.push(['Altura', `${sv.altura} cm`]);
    if (sv.imc) vitalsData.push(['IMC', sv.imc]);
    if (sv.glasgow) vitalsData.push(['Glasgow', sv.glasgow]);
    if (sv.dor) vitalsData.push(['Dor', `${sv.dor}/10`]);

    if (vitalsData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        body: vitalsData,
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 25, textColor: [0, 102, 68] } },
        margin: { left: margin + 2, right: margin },
        tableWidth: contentWidth - 4,
      });
      yPos = (doc as any).lastAutoTable.finalY + 4;
    }
  }

  // ─── Clinical Sections ───
  yPos = addSectionTitle('ANAMNESE', yPos);
  yPos = addTextField('Queixa Principal', prontuario.queixaPrincipal, yPos);
  yPos = addTextField('HDA', prontuario.historiaDoencaAtual, yPos);
  yPos = addTextField('HDP', prontuario.historiaPatologicaPregressa, yPos);
  yPos = addTextField('H. Familiar', prontuario.historiaFamiliar, yPos);
  yPos = addTextField('H. Social', prontuario.historiaSocial, yPos);
  yPos = addTextField('Revisão de Sistemas', prontuario.revisaoSistemas, yPos);
  yPos = addTextField('Alergias Relatadas', prontuario.alergiasRelatadas, yPos);
  yPos = addTextField('Medicamentos em Uso', prontuario.medicamentosEmUso, yPos);

  // Physical exam
  const hasExame = prontuario.examesFisicos || prontuario.exameCabecaPescoco || prontuario.exameTorax || prontuario.exameAbdomen || prontuario.exameMembros || prontuario.exameNeurologico || prontuario.examePele;
  if (hasExame) {
    yPos = addSectionTitle('EXAME FÍSICO', yPos);
    yPos = addTextField('Geral', prontuario.examesFisicos, yPos);
    yPos = addTextField('Cabeça/Pescoço', prontuario.exameCabecaPescoco, yPos);
    yPos = addTextField('Tórax', prontuario.exameTorax, yPos);
    yPos = addTextField('Abdome', prontuario.exameAbdomen, yPos);
    yPos = addTextField('Membros', prontuario.exameMembros, yPos);
    yPos = addTextField('Neurológico', prontuario.exameNeurologico, yPos);
    yPos = addTextField('Pele', prontuario.examePele, yPos);
  }

  // Diagnosis
  if (prontuario.hipoteseDiagnostica || prontuario.diagnosticoPrincipal) {
    yPos = addSectionTitle('DIAGNÓSTICO', yPos);
    yPos = addTextField('Hipótese Diagnóstica (CID-10)', prontuario.hipoteseDiagnostica, yPos);
    yPos = addTextField('Diagnóstico Principal', prontuario.diagnosticoPrincipal, yPos);
    if (prontuario.diagnosticosSecundarios && prontuario.diagnosticosSecundarios.length > 0) {
      yPos = addTextField('Diagnósticos Secundários', prontuario.diagnosticosSecundarios.join('; '), yPos);
    }
  }

  // Conduct
  if (prontuario.conduta || prontuario.planoTerapeutico || prontuario.orientacoesPaciente) {
    yPos = addSectionTitle('CONDUTA E PLANO', yPos);
    yPos = addTextField('Conduta', prontuario.conduta, yPos);
    yPos = addTextField('Plano Terapêutico', prontuario.planoTerapeutico, yPos);
    yPos = addTextField('Orientações ao Paciente', prontuario.orientacoesPaciente, yPos);
  }

  // Prescriptions
  if (prescricoes.length > 0) {
    yPos = addSectionTitle('PRESCRIÇÕES', yPos);
    const prescData = prescricoes.map((p, i) => [
      `${i + 1}`,
      p.medicamento,
      p.dosagem || '-',
      p.posologia || '-',
      p.duracao || '-',
      p.quantidade || '-',
    ]);
    autoTable(doc, {
      startY: yPos,
      head: [['#', 'Medicamento', 'Dosagem', 'Posologia', 'Duração', 'Qtd']],
      body: prescData,
      theme: 'grid',
      headStyles: { fillColor: [0, 153, 102], fontSize: 7, cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 8 } },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
    // prescription observations
    prescricoes.forEach((p, i) => {
      if (p.observacoes) {
        yPos = addTextField(`Obs Med. ${i + 1}`, p.observacoes, yPos);
      }
    });
  }

  // ─── Doctor signature ───
  if (yPos > 230) { doc.addPage(); yPos = 20; addPageAccent(doc); }
  yPos = Math.max(yPos + 15, 240);

  doc.setDrawColor(0, 153, 102);
  doc.setLineWidth(0.5);
  doc.line(55, yPos, 155, yPos);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(medico.nome, pageWidth / 2, yPos + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  const crmLine = [
    medico.crm ? `CRM: ${medico.crm}` : null,
    medico.crmUf || null,
    medico.rqe ? `RQE: ${medico.rqe}` : null,
    medico.especialidade || null,
  ].filter(Boolean).join(' | ');
  doc.text(crmLine, pageWidth / 2, yPos + 11, { align: 'center' });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.height;
    doc.setFillColor(0, 153, 102);
    doc.rect(0, pageHeight - 3, pageWidth, 3, 'F');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} — Prontuário digital ${DEFAULT_CLINICA.nome} — Pág. ${i}/${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
    doc.text('Documento confidencial — Uso exclusivo da equipe médica', pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  return doc;
}

function addPageAccent(doc: jsPDF) {
  doc.setFillColor(0, 153, 102);
  doc.rect(0, 0, doc.internal.pageSize.width, 3, 'F');
}

function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

// Gerar relatório de atendimentos
export async function gerarRelatorioAtendimentos(
  dados: {
    periodo: string;
    totalAtendimentos: number;
    porMedico: Array<{ nome: string; atendimentos: number; taxa: number }>;
    porTipo: Array<{ tipo: string; quantidade: number }>;
  }
) {
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF();

  addHeader(doc, 'RELATÓRIO DE ATENDIMENTOS');

  doc.setFontSize(10);
  doc.text(`Período: ${dados.periodo}`, 20, 60);
  doc.text(`Total de Atendimentos: ${dados.totalAtendimentos}`, 20, 67);

  // Por Médico
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ATENDIMENTOS POR MÉDICO', 20, 82);

  autoTable(doc, {
    startY: 87,
    head: [['Médico', 'Atendimentos', 'Taxa de Conclusão']],
    body: dados.porMedico.map((m) => [m.nome, m.atendimentos.toString(), `${m.taxa}%`]),
    theme: 'grid',
    headStyles: { fillColor: [0, 102, 204] },
    margin: { left: 20, right: 20 },
  });

  // Por Tipo
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('ATENDIMENTOS POR TIPO', 20, (doc as any).lastAutoTable.finalY + 15);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Tipo', 'Quantidade']],
    body: dados.porTipo.map((t) => [t.tipo, t.quantidade.toString()]),
    theme: 'grid',
    headStyles: { fillColor: [0, 102, 204] },
    margin: { left: 20, right: 20 },
    tableWidth: 100,
  });

  addFooter(doc);

  return doc;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// ─── LAUDO LABORATORIAL (estilo WEBLIS) ─────────────────────
export interface LaudoData {
  codigoAmostra: string;
  pacienteNome: string;
  pacienteCpf?: string;
  pacienteDataNascimento?: string;
  pacienteSexo?: string;
  medicoNome?: string;
  medicoCrm?: string;
  dataColeta: string;
  tipoAmostra?: string;
  tubo?: string;
  urgente?: boolean;
  observacoes?: string;
  requisicao?: string;
  convenioNome?: string;
  unidade?: string;
  posto?: string;
  email?: string;
  resultados: Array<{
    parametro: string;
    resultado: string;
    unidade?: string;
    valorReferenciaMin?: number;
    valorReferenciaMax?: number;
    valorReferenciaTexto?: string;
    metodo?: string;
    material?: string;
    tipoExame?: string;
    liberado: boolean;
    dataLiberacao?: string;
  }>;
}

function isResultadoAlterado(resultado: { resultado: string; valorReferenciaMin?: number; valorReferenciaMax?: number }): boolean {
  const numResult = parseFloat(resultado.resultado);
  if (isNaN(numResult)) return false;
  return (
    (resultado.valorReferenciaMin != null && numResult < resultado.valorReferenciaMin) ||
    (resultado.valorReferenciaMax != null && numResult > resultado.valorReferenciaMax)
  );
}

function calcularIdade(dataNascimento: string): string {
  try {
    const nasc = new Date(dataNascimento);
    const hoje = new Date();
    let anos = hoje.getFullYear() - nasc.getFullYear();
    let meses = hoje.getMonth() - nasc.getMonth();
    const dias = hoje.getDate() - nasc.getDate();
    if (dias < 0) { meses--; }
    if (meses < 0) { anos--; meses += 12; }
    return `${anos} anos ${meses} meses`;
  } catch { return ''; }
}

function formatSexo(sexo?: string): string {
  if (!sexo) return '';
  const s = sexo.toLowerCase();
  if (s === 'm' || s === 'masculino') return 'Masculino';
  if (s === 'f' || s === 'feminino') return 'Feminino';
  return sexo;
}

export async function gerarLaudoPDF(dados: LaudoData): Promise<jsPDF> {
  const { JsPDF, autoTable } = await carregarPdfLib();
  const doc = new JsPDF();
  const clinica = await getClinicaInfo();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const rightX = pageWidth - margin;
  let y = 12;

  // ── CABEÇALHO (logo à esquerda, dados clínica à direita) ──
  if (clinica.logoUrl) {
    const logoBase64 = await loadImageAsBase64(clinica.logoUrl);
    if (logoBase64) {
      try { doc.addImage(logoBase64, 'PNG', margin, y, 28, 28); } catch {
        console.warn('Não foi possível adicionar o logo ao laudo PDF.');
      }
    }
  }

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(clinica.nome.toUpperCase(), pageWidth / 2, y + 4, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  if (dados.email) doc.text(`E-mail: ${dados.email}`, pageWidth / 2, y + 10, { align: 'center' });
  doc.text(clinica.endereco, pageWidth / 2, y + 14, { align: 'center' });
  doc.text(`Telefone: ${clinica.telefone}`, pageWidth / 2, y + 18, { align: 'center' });

  y += 30;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, rightX, y);
  y += 6;

  // ── DADOS DO PACIENTE ──
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Sr.(a): ${dados.pacienteNome.toUpperCase()}`, margin, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const infoLines: string[] = [];
  if (dados.pacienteDataNascimento) {
    const nascFormatado = format(new Date(dados.pacienteDataNascimento), 'dd/MM/yyyy');
    const idade = calcularIdade(dados.pacienteDataNascimento);
    const sexo = formatSexo(dados.pacienteSexo);
    infoLines.push(`Nasc: ${nascFormatado} - Idade: ${idade}${sexo ? ` - Sexo: ${sexo}` : ''}`);
  }
  if (dados.medicoNome || dados.medicoCrm) {
    infoLines.push(`Dr.(a): ${dados.medicoCrm || ''} - ${dados.medicoNome || ''}`);
  }
  if (dados.unidade) infoLines.push(`Unidade: ${dados.unidade}`);
  if (dados.posto) infoLines.push(`Posto: ${dados.posto}`);
  if (dados.convenioNome) infoLines.push(`Convênio: ${dados.convenioNome}`);

  for (const line of infoLines) {
    doc.text(line, margin, y);
    y += 4;
  }

  // Requisição e data recebimento (lado direito)
  const reqY = y - infoLines.length * 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  if (dados.requisicao || dados.codigoAmostra) {
    doc.text(`Requisição: ${dados.requisicao || dados.codigoAmostra}`, rightX, reqY, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Recebido em: ${dados.dataColeta}`, rightX, reqY + 5, { align: 'right' });

  y += 4;
  doc.setLineWidth(0.3);
  doc.line(margin, y, rightX, y);
  y += 2;

  // ── RESULTADOS (agrupados por tipo de exame) ──
  const exameGroups = new Map<string, typeof dados.resultados>();
  for (const r of dados.resultados) {
    const key = r.tipoExame || r.parametro;
    if (!exameGroups.has(key)) exameGroups.set(key, []);
    exameGroups.get(key)!.push(r);
  }

  for (const [nomeExame, resultados] of exameGroups) {
    if (y > pageHeight - 50) { doc.addPage(); y = margin; }

    // Barra do nome do exame
    y += 4;
    doc.setFillColor(60, 60, 60);
    doc.rect(margin, y - 3.5, rightX - margin, 5.5, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(nomeExame.toUpperCase(), margin + 2, y + 0.5);
    doc.setTextColor(0, 0, 0);
    y += 5;

    // Material e Método
    const firstR = resultados[0];
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    if (firstR.material) doc.text(`Material: ${firstR.material}`, margin, y);
    if (firstR.metodo) doc.text(`Método: ${firstR.metodo}`, margin + 60, y);
    y += 4;

    // Cabeçalho da subtabela
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    const colResult = margin;
    const colValor = margin + 55;
    const colRef = rightX - 35;
    doc.text('Resultado', colResult, y);
    doc.text('Resultados Anteriores', colValor + 10, y);
    doc.text('Valor de Referência', colRef, y);
    y += 1;
    doc.setLineWidth(0.2);
    doc.line(margin, y, rightX, y);
    y += 4;

    // Linhas de resultado
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    for (const r of resultados) {
      if (y > pageHeight - 25) { doc.addPage(); y = margin; }

      // Parametro como label se for diferente do grupo
      if (resultados.length > 1 || r.parametro !== nomeExame) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.text(r.parametro + ':', margin, y);
        y += 3.5;
      }

      const alterado = isResultadoAlterado(r);
      doc.setFont('helvetica', alterado ? 'bold' : 'normal');
      doc.setFontSize(8);
      if (alterado) doc.setTextColor(220, 38, 38);
      else doc.setTextColor(0, 0, 0);

      const resultText = `${r.resultado} ${r.unidade || ''}`.trim();
      doc.text(resultText, colResult, y);

      // Colunas de resultados anteriores (placeholder: ---) 
      doc.setTextColor(150, 150, 150);
      doc.text('---', colValor + 15, y);
      doc.text('---', colValor + 30, y);

      // Valor de referência
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      const referencia = r.valorReferenciaTexto ||
        (r.valorReferenciaMin != null && r.valorReferenciaMax != null
          ? `${r.valorReferenciaMin} a ${r.valorReferenciaMax} ${r.unidade || ''}`
          : '—');
      doc.text(referencia, colRef, y);

      y += 5;
    }

    y += 2;
    doc.setLineWidth(0.15);
    doc.line(margin, y, rightX, y);
  }

  // ── URGENTE ──
  if (dados.urgente) {
    y += 6;
    doc.setFillColor(220, 38, 38);
    doc.rect(margin, y - 3, 30, 6, 'F');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('URGENTE', margin + 15, y + 1, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  // ── OBSERVAÇÕES ──
  if (dados.observacoes) {
    y += 4;
    if (y > pageHeight - 40) { doc.addPage(); y = margin; }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVAÇÕES:', margin, y);
    doc.setFont('helvetica', 'normal');
    y += 4;
    const obsLines = doc.splitTextToSize(dados.observacoes, rightX - margin);
    doc.text(obsLines, margin, y);
    y += obsLines.length * 3.5 + 4;
  }

  // ── ASSINATURA (lado direito, estilo WEBLIS) ──
  if (y > pageHeight - 40) { doc.addPage(); y = margin; }
  y += 10;

  // Data de assinatura
  const dataLiberacao = dados.resultados.find(r => r.dataLiberacao)?.dataLiberacao;
  const assinadoEm = dataLiberacao
    ? format(new Date(dataLiberacao), "dd/MM/yyyy HH:mm:ss")
    : format(new Date(), "dd/MM/yyyy HH:mm:ss");

  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(`Assinado em: ${assinadoEm}`, rightX, y, { align: 'right' });
  y += 8;

  // Nome e cargo do responsável
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  if (dados.medicoNome) doc.text(dados.medicoNome, rightX, y, { align: 'right' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Analista de Laboratório', rightX, y, { align: 'right' });
  if (dados.medicoCrm) {
    y += 3.5;
    doc.text(`CRBM: ${dados.medicoCrm}`, rightX, y, { align: 'right' });
  }

  // ── QR CODE ──
  try {
    const qrUrl = `https://app.elolab.com.br/validar/${dados.codigoAmostra}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 60, margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', margin, y - 12, 20, 20);
  } catch {
    console.warn('Não foi possível gerar o QR Code do laudo PDF.');
  }

  // ── RODAPÉ ──
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} - Código: ${dados.codigoAmostra}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );

  return doc;
}

export async function downloadLaudoPDF(dados: LaudoData): Promise<void> {
  const doc = await gerarLaudoPDF(dados);
  downloadPDF(doc, `laudo-${dados.codigoAmostra}`);
}

export async function printLaudoPDF(dados: LaudoData): Promise<void> {
  const doc = await gerarLaudoPDF(dados);
  openPDF(doc);
}

// Download PDF
export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(`${filename}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

// Abrir PDF em nova janela
export function openPDF(doc: jsPDF) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// Share PDF via WhatsApp (opens WhatsApp with a message; browser limitation prevents direct file attach)
export function sharePDFWhatsApp(doc: jsPDF, filename: string, telefone?: string) {
  // Download the file first
  doc.save(`${filename}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);

  // Build WhatsApp message
  const msg = encodeURIComponent(
    `📋 *Prontuário Digital - ${DEFAULT_CLINICA.nome}*\n\nOlá! Segue em anexo o prontuário do atendimento.\n\n_Documento gerado digitalmente pelo sistema EloLab._`
  );

  const phone = telefone?.replace(/\D/g, '') || '';
  const waUrl = phone
    ? `https://wa.me/55${phone}?text=${msg}`
    : `https://wa.me/?text=${msg}`;

  window.open(waUrl, '_blank');
}
