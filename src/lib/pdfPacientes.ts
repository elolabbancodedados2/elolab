/**
 * Documentos em PDF da área de pacientes: ficha cadastral com o termo LGPD,
 * declaração de pagamentos para o Imposto de Renda e a versão legível da
 * exportação LGPD.
 *
 * As regras de conteúdo são funções puras (testadas); a montagem do PDF carrega
 * o jsPDF só quando alguém clica para gerar.
 */
import type jsPDF from 'jspdf';
import { getClinicaInfo, linhaContatoClinica } from '@/lib/pdfGenerator';
import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';
import { cpfMascarado, formatarCpf, sexoPorExtenso, textoIdade } from '@/lib/pacienteFicha';

async function carregarJsPdf() {
  const { default: JsPDF } = await import('jspdf');
  return JsPDF;
}

const MARGEM = 18;
const LARGURA = 210 - MARGEM * 2;

function dataBr(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function moedaBr(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(valor) ? valor : 0);
}

/** Escreve linhas com quebra automática e nova página quando acabar o espaço. */
function escrever(doc: jsPDF, texto: string, y: number, opcoes: { tamanho?: number; negrito?: boolean; espaco?: number } = {}): number {
  const tamanho = opcoes.tamanho ?? 10;
  doc.setFont('helvetica', opcoes.negrito ? 'bold' : 'normal');
  doc.setFontSize(tamanho);
  const linhas = doc.splitTextToSize(texto, LARGURA) as string[];
  const altura = tamanho * 0.45;
  for (const linha of linhas) {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(linha, MARGEM, y);
    y += altura;
  }
  return y + (opcoes.espaco ?? 1.5);
}

async function cabecalho(doc: jsPDF, titulo: string): Promise<number> {
  const clinica = await getClinicaInfo();
  let y = 18;
  if (clinica.nome) y = escrever(doc, clinica.nome, y, { tamanho: 14, negrito: true });
  const contato = [clinica.endereco, linhaContatoClinica(clinica)].filter(Boolean).join(' · ');
  if (contato) y = escrever(doc, contato, y, { tamanho: 9 });
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGEM, y, 210 - MARGEM, y);
  y += 7;
  return escrever(doc, titulo, y, { tamanho: 13, negrito: true, espaco: 3 });
}

function rodape(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Gerado em ${formatDateTimeSaoPaulo(new Date())} · Página ${pagina} de ${total}`, 105, 290, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }
}

// ─── Ficha cadastral ─────────────────────────────────────────────────────────

export interface PacienteFichaPdf {
  nome: string;
  nome_social?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
  sexo?: string | null;
  telefone?: string | null;
  email?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  numero_carteira?: string | null;
  validade_carteira?: string | null;
  alergias?: string[] | null;
  nome_responsavel?: string | null;
  cpf_responsavel?: string | null;
  parentesco_responsavel?: string | null;
}

/** Pares rótulo/valor da ficha, na ordem impressa. O CPF sai completo: o papel é para assinatura. */
export function camposFichaPaciente(paciente: PacienteFichaPdf, convenio: string): Array<[string, string]> {
  const endereco = [
    [paciente.logradouro, paciente.numero].filter(Boolean).join(', '),
    paciente.complemento,
    paciente.bairro,
    [paciente.cidade, paciente.estado].filter(Boolean).join('/'),
    paciente.cep ? `CEP ${paciente.cep}` : '',
  ].filter(Boolean).join(' · ');
  const campos: Array<[string, string]> = [
    ['Nome', paciente.nome],
    ['Nome social', paciente.nome_social || '—'],
    ['CPF', paciente.cpf ? formatarCpf(paciente.cpf) : '—'],
    ['Nascimento', paciente.data_nascimento ? `${dataBr(paciente.data_nascimento)} (${textoIdade(paciente.data_nascimento)})` : '—'],
    ['Sexo', sexoPorExtenso(paciente.sexo) ?? '—'],
    ['Telefone', paciente.telefone || '—'],
    ['E-mail', paciente.email || '—'],
    ['Endereço', endereco || '—'],
    ['Convênio', convenio],
    ['Carteirinha', paciente.numero_carteira ? `${paciente.numero_carteira}${paciente.validade_carteira ? ` · validade ${dataBr(paciente.validade_carteira)}` : ''}` : '—'],
    ['Alergias', paciente.alergias?.length ? paciente.alergias.join(', ') : 'Nenhuma informada'],
  ];
  if (paciente.nome_responsavel) {
    campos.push(['Responsável', `${paciente.nome_responsavel}${paciente.parentesco_responsavel ? ` (${paciente.parentesco_responsavel})` : ''}${paciente.cpf_responsavel ? ` · CPF ${formatarCpf(paciente.cpf_responsavel)}` : ''}`]);
  }
  return campos;
}

export async function gerarFichaPacientePDF(paciente: PacienteFichaPdf, convenio: string, termo: string): Promise<jsPDF> {
  const JsPDF = await carregarJsPdf();
  const doc = new JsPDF();
  let y = await cabecalho(doc, 'Ficha cadastral do paciente');
  for (const [rotulo, valor] of camposFichaPaciente(paciente, convenio)) {
    y = escrever(doc, `${rotulo}: ${valor}`, y);
  }
  y += 4;
  y = escrever(doc, 'Declaro que as informações acima são verdadeiras.', y);
  y += 10;
  y = escrever(doc, '______________________________________________', y, { espaco: 0 });
  y = escrever(doc, `Assinatura do paciente ou responsável · Data: ____/____/______`, y, { tamanho: 9, espaco: 6 });

  doc.addPage();
  y = 20;
  for (const paragrafo of termo.trim().split(/\n{2,}/)) {
    y = escrever(doc, paragrafo.trim(), y, { tamanho: 9.5, espaco: 3 });
  }
  y += 10;
  y = escrever(doc, `Titular: ${paciente.nome}${paciente.cpf ? ` · CPF ${formatarCpf(paciente.cpf)}` : ''}`, y);
  y += 8;
  y = escrever(doc, '______________________________________________', y, { espaco: 0 });
  escrever(doc, 'Assinatura do titular ou responsável legal · Data: ____/____/______', y, { tamanho: 9 });
  rodape(doc);
  return doc;
}

// ─── Declaração para o Imposto de Renda ──────────────────────────────────────

export interface CobrancaParaDeclaracao {
  data: string;
  status: string;
  valor_pago: number | string | null;
  descricao?: string | null;
  categoria?: string | null;
}

/** Anos com valor pago, do mais recente ao mais antigo. */
export function anosComPagamento(cobrancas: readonly CobrancaParaDeclaracao[]): number[] {
  const anos = new Set<number>();
  for (const c of cobrancas) {
    if (['cancelado', 'estornado'].includes(c.status)) continue;
    if ((Number(c.valor_pago) || 0) <= 0) continue;
    const ano = Number(String(c.data).slice(0, 4));
    if (Number.isInteger(ano)) anos.add(ano);
  }
  return [...anos].sort((a, b) => b - a);
}

/** Itens pagos no ano (pela data da cobrança) e o total. Cancelado e estornado ficam fora. */
export function resumoDeclaracaoIR(cobrancas: readonly CobrancaParaDeclaracao[], ano: number) {
  const itens = cobrancas
    .filter(c => !['cancelado', 'estornado'].includes(c.status))
    .filter(c => String(c.data).startsWith(`${ano}-`))
    .map(c => ({ data: c.data, descricao: c.descricao || c.categoria || 'Serviço de saúde', valor: Math.round((Number(c.valor_pago) || 0) * 100) / 100 }))
    .filter(c => c.valor > 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  const total = Math.round(itens.reduce((soma, item) => soma + item.valor * 100, 0)) / 100;
  return { itens, total };
}

export async function gerarDeclaracaoIRPDF(
  paciente: { nome: string; cpf?: string | null },
  ano: number,
  cobrancas: readonly CobrancaParaDeclaracao[],
): Promise<jsPDF> {
  const JsPDF = await carregarJsPdf();
  const doc = new JsPDF();
  const clinica = await getClinicaInfo();
  const { itens, total } = resumoDeclaracaoIR(cobrancas, ano);
  let y = await cabecalho(doc, `Declaração de pagamentos · ano-calendário ${ano}`);
  y = escrever(doc,
    `Declaramos, para fins de Imposto de Renda, que ${paciente.nome}${paciente.cpf ? `, CPF ${formatarCpf(paciente.cpf)},` : ''} pagou a ${clinica.nome || 'esta clínica'}${clinica.cnpj ? `, CNPJ ${clinica.cnpj},` : ''} o total de ${moedaBr(total)} por serviços de saúde com data em ${ano}.`,
    y, { tamanho: 11, espaco: 5 });
  y = escrever(doc, 'Data · Descrição · Valor pago', y, { negrito: true });
  for (const item of itens) y = escrever(doc, `${dataBr(item.data)} · ${item.descricao} · ${moedaBr(item.valor)}`, y);
  if (itens.length === 0) y = escrever(doc, 'Nenhum pagamento registrado neste ano.', y);
  y = escrever(doc, `Total: ${moedaBr(total)}`, y + 2, { negrito: true, espaco: 12 });
  y = escrever(doc, '______________________________________________', y, { espaco: 0 });
  escrever(doc, `${clinica.nome || 'Responsável pela clínica'} · Data: ____/____/______`, y, { tamanho: 9 });
  rodape(doc);
  return doc;
}

// ─── Exportação LGPD legível ─────────────────────────────────────────────────

const CAMPOS_OCULTOS = /(^id$|_id$|^clinica|base64|conteudo_arquivo|token|hash|url_arquivo|storage)/i;

function valorLegivel(chave: string, valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (CAMPOS_OCULTOS.test(chave)) return null;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length ? valor.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ').slice(0, 300) : null;
  if (typeof valor === 'object') return JSON.stringify(valor).slice(0, 300);
  const texto = String(valor);
  if (chave === 'cpf') return cpfMascarado(texto);
  if (/^\d{4}-\d{2}-\d{2}T/.test(texto)) return formatDateTimeSaoPaulo(texto);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return dataBr(texto);
  return texto.length > 400 ? `${texto.slice(0, 400)}…` : texto;
}

function rotuloCampo(chave: string): string {
  const texto = chave.replace(/_/g, ' ');
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}

/**
 * Seções legíveis da exportação: uma por tabela, com até `limite` registros e
 * os campos úteis ao titular. Identificadores internos e arquivos em Base64
 * ficam de fora; o JSON continua sendo o pacote completo.
 */
export function secoesLegiveisExportacao(dados: Record<string, unknown>, limite = 50) {
  const secoes: Array<{ titulo: string; total: number; registros: string[][] }> = [];
  for (const [chave, valor] of Object.entries(dados)) {
    if (chave === 'exportacao' || chave === 'metadata') continue;
    const registros = Array.isArray(valor) ? valor : valor && typeof valor === 'object' ? [valor] : [];
    if (registros.length === 0) continue;
    secoes.push({
      titulo: rotuloCampo(chave),
      total: registros.length,
      registros: registros.slice(0, limite).map(registro => Object.entries(registro as Record<string, unknown>)
        .map(([campo, v]) => {
          const texto = valorLegivel(campo, v);
          return texto ? `${rotuloCampo(campo)}: ${texto}` : null;
        })
        .filter((linha): linha is string => Boolean(linha))),
    });
  }
  return secoes;
}

export async function gerarExportacaoLgpdPDF(titular: string, protocolo: string | null, dados: Record<string, unknown>): Promise<jsPDF> {
  const JsPDF = await carregarJsPdf();
  const doc = new JsPDF();
  let y = await cabecalho(doc, 'Relatório dos seus dados pessoais (LGPD)');
  y = escrever(doc, `Titular: ${titular}${protocolo ? ` · Protocolo ${protocolo}` : ''}`, y);
  y = escrever(doc, 'Versão para leitura. O arquivo JSON entregue junto é o pacote completo, com todos os campos.', y, { tamanho: 9, espaco: 5 });
  for (const secao of secoesLegiveisExportacao(dados)) {
    y = escrever(doc, `${secao.titulo} (${secao.total})`, y + 2, { tamanho: 11, negrito: true });
    secao.registros.forEach((linhas, indice) => {
      y = escrever(doc, `${indice + 1}. ${linhas.join(' · ') || '—'}`, y, { tamanho: 8.5 });
    });
    if (secao.total > secao.registros.length) y = escrever(doc, `… e mais ${secao.total - secao.registros.length} registro(s) no arquivo JSON.`, y, { tamanho: 8.5 });
  }
  rodape(doc);
  return doc;
}
