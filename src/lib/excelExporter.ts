/**
 * Exportação para .xlsx.
 *
 * Substituímos `xlsx@0.18.5` por `write-excel-file` em 08/2026 (SEC-001):
 * prototype pollution e ReDoS sem patch upstream. `write-excel-file` é
 * ~5× menor, mantido, e cobre 100% dos casos que este módulo produz —
 * uma aba ou várias, com cabeçalho, largura por coluna e formatação básica
 * de data/boolean/número.
 *
 * Import dinâmico: a lib entra no chunk só quando alguém clica em exportar.
 * Sem isso, todo mundo que abre a tela de Relatórios ou Contas a Receber
 * baixa ~100 KB de gzip que quase nunca são usados.
 */
import { format } from 'date-fns';
import { parseDateOnly } from '@/lib/dateOnly';

type WriteXlsxFile = typeof import('write-excel-file/browser').default;
let _writer: WriteXlsxFile | null = null;

async function carregarEscritor(): Promise<WriteXlsxFile> {
  if (!_writer) {
    const mod = await import('write-excel-file/browser');
    _writer = mod.default;
  }
  return _writer;
}

interface CellSpec {
  value: string | number | Date | boolean | null;
  type?: typeof String | typeof Number | typeof Date | typeof Boolean;
  format?: string;
}

interface ColumnSpec { width: number }

/**
 * Aceita o mesmo shape do exportador antigo, converte cada linha em
 * `CellSpec[]` do `write-excel-file`, calcula largura por coluna e baixa.
 *
 * No browser, `writeXlsxFile` retorna `{ toBlob, toFile }`. Chamamos
 * `.toFile(nome)` para o navegador iniciar o download com o nome certo.
 */
export async function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Dados',
  columnHeaders?: Record<keyof T, string>
) {
  const writer = await carregarEscritor();
  const dateStr = format(new Date(), 'yyyy-MM-dd');

  if (data.length === 0) {
    // Ainda assim gera arquivo (não deixa botão parecer travado).
    const resultado = writer([[{ value: '(sem dados)', type: String }]], {
      sheet: sheetName.substring(0, 31),
    });
    await resultado.toFile(`${filename}-${dateStr}.xlsx`);
    return;
  }

  const chaves = Object.keys(data[0]) as (keyof T)[];
  const cabecalhos = chaves.map((k) => columnHeaders?.[k] ?? String(k));

  const linhaCabecalho: CellSpec[] = cabecalhos.map((h) => ({
    value: h, type: String,
  }));
  const linhas: CellSpec[][] = data.map((row) =>
    chaves.map((k) => celulaDe(row[k])),
  );

  const colunas: ColumnSpec[] = larguraDasColunas(cabecalhos, data, chaves);

  const resultado = writer([linhaCabecalho, ...linhas], {
    sheet: sheetName.substring(0, 31),
    columns: colunas,
  });
  await resultado.toFile(`${filename}-${dateStr}.xlsx`);
}

/** Exporta múltiplas abas em um único arquivo. */
export async function exportToExcelMultiSheet(
  sheets: Array<{
    data: Record<string, any>[];
    sheetName: string;
    columnHeaders?: Record<string, string>;
  }>,
  filename: string
) {
  const writer = await carregarEscritor();

  // Overload "Multiple sheets" espera `Sheet<FileContent>[]` — cada Sheet é
  // um objeto com `data`, `sheet` (nome), `columns` etc.
  const abas = sheets.map(({ data, sheetName, columnHeaders }) => {
    const chaves = data.length > 0 ? Object.keys(data[0]) : [];
    const cabecalhos = chaves.map((k) => columnHeaders?.[k] ?? k);
    return {
      sheet: sheetName.substring(0, 31),
      data: [
        cabecalhos.map((h) => ({ value: h, type: String } as CellSpec)),
        ...data.map((row) => chaves.map((k) => celulaDe(row[k]))),
      ],
      columns: larguraDasColunas(cabecalhos, data, chaves),
    };
  });

  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const resultado = writer(abas as Parameters<typeof writer>[0]);
  await resultado.toFile(`${filename}-${dateStr}.xlsx`);
}

/** Converte um valor JS na `CellSpec` que o `write-excel-file` espera. */
function celulaDe(v: unknown): CellSpec {
  if (v == null || v === '') return { value: '', type: String };
  if (v instanceof Date) return { value: v, type: Date, format: 'dd/mm/yyyy hh:mm' };
  if (typeof v === 'boolean') return { value: v ? 'Sim' : 'Não', type: String };
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v, type: Number };
  if (Array.isArray(v)) return { value: v.join(', '), type: String };
  if (typeof v === 'object') return { value: JSON.stringify(v), type: String };
  return { value: String(v), type: String };
}

/**
 * Largura por coluna, seguindo o texto mais longo com teto de 50.
 * Padrão idêntico ao exportador anterior.
 */
function larguraDasColunas(
  cabecalhos: string[],
  data: Record<string, any>[],
  chaves: (string | number | symbol)[],
): ColumnSpec[] {
  return cabecalhos.map((h, i) => {
    let max = h.length;
    for (const row of data) {
      const v = row[chaves[i] as string];
      const s = v == null ? '' : String(v);
      if (s.length > max) max = s.length;
    }
    return { width: Math.min(max + 2, 50) };
  });
}

// ─── Exportadores específicos (não mudou nada da API pública) ──────────────

export async function exportarPacientes(
  pacientes: Array<{
    nome: string;
    cpf: string;
    dataNascimento: string;
    telefone: string;
    email?: string;
    sexo?: string;
    convenio?: { nome: string; numeroCarteira?: string };
    endereco?: { cidade?: string; estado?: string };
  }>
) {
  const data = pacientes.map((p) => ({
    nome: p.nome,
    cpf: p.cpf,
    dataNascimento: p.dataNascimento ? format(new Date(p.dataNascimento), 'dd/MM/yyyy') : '',
    telefone: p.telefone,
    email: p.email || '',
    sexo: p.sexo === 'M' ? 'Masculino' : p.sexo === 'F' ? 'Feminino' : 'Outro',
    convenio: p.convenio?.nome || 'Particular',
    numeroCarteira: p.convenio?.numeroCarteira || '',
    cidade: p.endereco?.cidade || '',
    estado: p.endereco?.estado || '',
  }));

  await exportToExcel(data, 'pacientes', 'Pacientes', {
    nome: 'Nome',
    cpf: 'CPF',
    dataNascimento: 'Data de Nascimento',
    telefone: 'Telefone',
    email: 'E-mail',
    sexo: 'Sexo',
    convenio: 'Convênio',
    numeroCarteira: 'Nº Carteira',
    cidade: 'Cidade',
    estado: 'Estado',
  } as any);
}

export async function exportarFinanceiro(
  lancamentos: Array<{
    data: string;
    tipo: string;
    categoria: string;
    descricao: string;
    valor: number;
    status: string;
    formaPagamento?: string;
  }>
) {
  const data = lancamentos.map((l) => ({
    data: l.data ? format(parseDateOnly(l.data)!, 'dd/MM/yyyy') : '',
    tipo: l.tipo === 'receita' ? 'Receita' : 'Despesa',
    categoria: l.categoria,
    descricao: l.descricao,
    valor: l.valor,
    status: l.status.charAt(0).toUpperCase() + l.status.slice(1),
    formaPagamento: l.formaPagamento?.replace('_', ' ') || '',
  }));

  await exportToExcel(data, 'financeiro', 'Lançamentos', {
    data: 'Data',
    tipo: 'Tipo',
    categoria: 'Categoria',
    descricao: 'Descrição',
    valor: 'Valor (R$)',
    status: 'Status',
    formaPagamento: 'Forma de Pagamento',
  } as any);
}

export async function exportarEstoque(
  itens: Array<{
    nome: string;
    categoria: string;
    quantidade: number;
    quantidadeMinima: number;
    unidade: string;
    valorUnitario: number;
    fornecedor?: string;
    validade?: string;
  }>
) {
  const data = itens.map((i) => ({
    nome: i.nome,
    categoria: i.categoria,
    quantidade: i.quantidade,
    quantidadeMinima: i.quantidadeMinima,
    unidade: i.unidade,
    valorUnitario: i.valorUnitario,
    valorTotal: i.quantidade * i.valorUnitario,
    fornecedor: i.fornecedor || '',
    validade: i.validade ? format(parseDateOnly(i.validade)!, 'dd/MM/yyyy') : '',
    status: i.quantidade <= i.quantidadeMinima ? 'BAIXO' : 'OK',
  }));

  await exportToExcel(data, 'estoque', 'Itens', {
    nome: 'Nome',
    categoria: 'Categoria',
    quantidade: 'Quantidade',
    quantidadeMinima: 'Qtd. Mínima',
    unidade: 'Unidade',
    valorUnitario: 'Valor Unit. (R$)',
    valorTotal: 'Valor Total (R$)',
    fornecedor: 'Fornecedor',
    validade: 'Validade',
    status: 'Status',
  } as any);
}

export async function exportarAgendamentos(
  agendamentos: Array<{
    data: string;
    horaInicio: string;
    horaFim: string;
    paciente: string;
    medico: string;
    tipo: string;
    status: string;
    sala?: string;
  }>
) {
  const data = agendamentos.map((a) => ({
    data: a.data ? format(parseDateOnly(a.data)!, 'dd/MM/yyyy') : '',
    horaInicio: a.horaInicio,
    horaFim: a.horaFim,
    paciente: a.paciente,
    medico: a.medico,
    tipo: a.tipo.charAt(0).toUpperCase() + a.tipo.slice(1),
    status: a.status.replace('_', ' ').toUpperCase(),
    sala: a.sala || '',
  }));

  await exportToExcel(data, 'agendamentos', 'Agendamentos', {
    data: 'Data',
    horaInicio: 'Início',
    horaFim: 'Fim',
    paciente: 'Paciente',
    medico: 'Médico',
    tipo: 'Tipo',
    status: 'Status',
    sala: 'Sala',
  } as any);
}
