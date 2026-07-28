import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { parseDateOnly } from '@/lib/dateOnly';

// Exportar dados para Excel
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Dados',
  columnHeaders?: Record<keyof T, string>
) {
  // Preparar dados com headers traduzidos
  let processedData: Record<string, any>[];

  if (columnHeaders) {
    processedData = data.map((row) => {
      const newRow: Record<string, any> = {};
      Object.keys(row).forEach((key) => {
        const header = columnHeaders[key as keyof T] || key;
        newRow[header] = formatValue(row[key]);
      });
      return newRow;
    });
  } else {
    processedData = data.map((row) => {
      const newRow: Record<string, any> = {};
      Object.keys(row).forEach((key) => {
        newRow[key] = formatValue(row[key]);
      });
      return newRow;
    });
  }

  // Criar workbook e worksheet
  const worksheet = XLSX.utils.json_to_sheet(processedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Auto-ajustar largura das colunas
  const colWidths = calculateColumnWidths(processedData);
  worksheet['!cols'] = colWidths;

  // Gerar arquivo e download
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`);
}

// Exportar múltiplas abas
export function exportToExcelMultiSheet(
  sheets: Array<{
    data: Record<string, any>[];
    sheetName: string;
    columnHeaders?: Record<string, string>;
  }>,
  filename: string
) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(({ data, sheetName, columnHeaders }) => {
    let processedData: Record<string, any>[];

    if (columnHeaders) {
      processedData = data.map((row) => {
        const newRow: Record<string, any> = {};
        Object.keys(row).forEach((key) => {
          const header = columnHeaders[key] || key;
          newRow[header] = formatValue(row[key]);
        });
        return newRow;
      });
    } else {
      processedData = data.map((row) => {
        const newRow: Record<string, any> = {};
        Object.keys(row).forEach((key) => {
          newRow[key] = formatValue(row[key]);
        });
        return newRow;
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(processedData);
    worksheet['!cols'] = calculateColumnWidths(processedData);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31)); // Max 31 chars
  });

  const dateStr = format(new Date(), 'yyyy-MM-dd');
  XLSX.writeFile(workbook, `${filename}-${dateStr}.xlsx`);
}

// Formatar valores para Excel
function formatValue(value: any): any {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return format(value, 'dd/MM/yyyy HH:mm');
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}

// Calcular largura das colunas baseado no conteúdo
function calculateColumnWidths(data: Record<string, any>[]): { wch: number }[] {
  if (data.length === 0) return [];

  const headers = Object.keys(data[0]);
  const widths = headers.map((header) => {
    let maxWidth = header.length;

    data.forEach((row) => {
      const value = String(row[header] || '');
      if (value.length > maxWidth) {
        maxWidth = value.length;
      }
    });

    return { wch: Math.min(maxWidth + 2, 50) }; // Max 50 chars
  });

  return widths;
}

// Exportar pacientes
export function exportarPacientes(
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

  exportToExcel(data, 'pacientes', 'Pacientes', {
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

// Exportar lançamentos financeiros
export function exportarFinanceiro(
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

  exportToExcel(data, 'financeiro', 'Lançamentos', {
    data: 'Data',
    tipo: 'Tipo',
    categoria: 'Categoria',
    descricao: 'Descrição',
    valor: 'Valor (R$)',
    status: 'Status',
    formaPagamento: 'Forma de Pagamento',
  } as any);
}

// Exportar estoque
export function exportarEstoque(
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

  exportToExcel(data, 'estoque', 'Itens', {
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

// Exportar agendamentos
export function exportarAgendamentos(
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

  exportToExcel(data, 'agendamentos', 'Agendamentos', {
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
