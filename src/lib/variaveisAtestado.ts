/**
 * Dicionário único das variáveis de modelos de atestado.
 *
 * O editor de modelos sugeria {{paciente}}, {{data}}, {{medico}} e {{crm}},
 * mas a emissão só trocava {{nome_paciente}}, {{data_emissao}}, {{medico_nome}}
 * e {{medico_crm}}: o modelo salvo saía impresso com as chaves cruas. Agora
 * cada variável tem um nome principal e sinônimos, e as duas telas usam esta
 * mesma tabela.
 */

export type VariavelAtestado =
  | 'nome_paciente'
  | 'cpf_paciente'
  | 'data_emissao'
  | 'data_atual'
  | 'dias'
  | 'data_inicio'
  | 'data_fim'
  | 'hora_inicio'
  | 'hora_fim'
  | 'medico_nome'
  | 'medico_crm'
  | 'cid';

export const VARIAVEIS_ATESTADO: Array<{ chave: VariavelAtestado; sinonimos: string[]; descricao: string }> = [
  { chave: 'nome_paciente', sinonimos: ['paciente', 'nome'], descricao: 'Nome do paciente' },
  { chave: 'cpf_paciente', sinonimos: ['cpf'], descricao: 'CPF do paciente' },
  { chave: 'data_emissao', sinonimos: ['data'], descricao: 'Data de emissão' },
  { chave: 'data_atual', sinonimos: ['hoje'], descricao: 'Data de hoje' },
  { chave: 'dias', sinonimos: ['dias_afastamento'], descricao: 'Dias de afastamento' },
  { chave: 'data_inicio', sinonimos: [], descricao: 'Início do afastamento' },
  { chave: 'data_fim', sinonimos: [], descricao: 'Fim do afastamento' },
  { chave: 'hora_inicio', sinonimos: [], descricao: 'Horário de chegada' },
  { chave: 'hora_fim', sinonimos: [], descricao: 'Horário de saída' },
  { chave: 'medico_nome', sinonimos: ['medico'], descricao: 'Nome do médico' },
  { chave: 'medico_crm', sinonimos: ['crm'], descricao: 'CRM do médico' },
  { chave: 'cid', sinonimos: [], descricao: 'CID-10 (só com autorização do paciente)' },
];

/** Texto curto para a ajuda das telas: "{{nome_paciente}} (ou {{paciente}}), …". */
export function legendaVariaveisAtestado(): string {
  return VARIAVEIS_ATESTADO
    .map(({ chave, sinonimos }) => `{{${chave}}}${sinonimos.length ? ` (ou ${sinonimos.map(s => `{{${s}}}`).join(', ')})` : ''}`)
    .join(', ');
}

/**
 * Troca as variáveis do texto. Aceita espaços dentro das chaves e ignora
 * caixa ({{ Paciente }} funciona). Variável desconhecida fica como está.
 */
export function substituirVariaveisAtestado(texto: string, valores: Partial<Record<VariavelAtestado, string>>): string {
  const porNome = new Map<string, VariavelAtestado>();
  for (const { chave, sinonimos } of VARIAVEIS_ATESTADO) {
    porNome.set(chave, chave);
    for (const sinonimo of sinonimos) porNome.set(sinonimo, chave);
  }
  return texto.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (original, nome: string) => {
    const chave = porNome.get(nome.toLowerCase());
    if (!chave) return original;
    return valores[chave] ?? original;
  });
}
