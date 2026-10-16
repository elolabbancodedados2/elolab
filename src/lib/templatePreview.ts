export const VALORES_EXEMPLO: Readonly<Record<string, string>> = {
  paciente_nome: 'João Silva',
  cpf: '123.456.789-10',
  data: '15/04/2026',
  horario: '14:30',
  medico_nome: 'Dr. Carlos Santos',
  tipo_consulta: 'Consulta Clínica',
  clinica_nome: 'Clínica Médica',
  clinica_endereco: 'Rua Principal, 100 — São Paulo/SP',
  clinica_telefone: '(11) 3000-0000',
  tipo_exame: 'Hemograma Completo',
  data_resultado: '14/04/2026',
  link_portal: 'https://app.elolab.com.br/portal',
  descricao: 'Consulta Clínica',
  valor: 'R$ 150,00',
  forma_pagamento: 'Cartão de Crédito',
  clinica_cnpj: '12.345.678/0001-90',
  item_nome: 'Luva Nitrílica P',
  quantidade_atual: '5',
  quantidade_minima: '20',
  localizacao: 'Armário A1',
};

const VARIAVEIS_POR_CATEGORIA: Readonly<Record<string, readonly string[]>> = {
  lembrete_consulta: ['paciente_nome', 'data', 'horario', 'medico_nome', 'clinica_nome', 'clinica_endereco'],
  confirmacao: ['paciente_nome', 'data', 'horario', 'medico_nome', 'clinica_nome', 'clinica_endereco'],
  confirmacao_consulta: ['paciente_nome', 'data', 'horario', 'medico_nome', 'clinica_nome', 'clinica_endereco'],
  resultado_exame: ['paciente_nome', 'tipo_exame', 'data_resultado', 'link_portal', 'clinica_nome'],
  aniversario: ['paciente_nome', 'clinica_nome'],
  financeiro: ['paciente_nome', 'valor', 'forma_pagamento', 'data', 'descricao', 'clinica_nome', 'clinica_cnpj'],
  estoque: [],
  geral: [],
};

export type TemplatePreview = {
  usedVariables: string[];
  missingVariables: string[];
  renderedSubject: string;
  renderedContent: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function variablesIn(value: string): string[] {
  const variables: string[] = [];
  const pattern = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (!variables.includes(match[1])) variables.push(match[1]);
  }
  return variables;
}

export function analyzeTemplatePreview(input: {
  name?: string | null;
  category: string;
  subject: string;
  content: string;
  values?: Readonly<Record<string, string>>;
}): TemplatePreview {
  const values = input.values ?? VALORES_EXEMPLO;
  const supported = new Set(VARIAVEIS_POR_CATEGORIA[input.category] ?? []);
  if (input.category === 'lembrete_consulta') {
    const name = (input.name ?? '').toLocaleLowerCase('pt-BR');
    if (name.includes('2h')) {
      supported.delete('data');
      supported.delete('clinica_endereco');
    }
  }

  const usedVariables = variablesIn(`${input.subject}\n${input.content}`);
  const missingVariables = usedVariables.filter((name) => !supported.has(name) || !values[name]?.trim());
  const missingSet = new Set(missingVariables);
  const renderText = (text: string) => text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (placeholder, name: string) => (
    missingSet.has(name) ? placeholder : values[name]
  ));
  const renderedContent = input.content.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (placeholder, name: string) => {
    if (missingSet.has(name)) return `<mark class="template-variable-missing">${escapeHtml(placeholder)}</mark>`;
    return escapeHtml(values[name]);
  });

  return {
    usedVariables,
    missingVariables,
    renderedSubject: renderText(input.subject),
    renderedContent,
  };
}
