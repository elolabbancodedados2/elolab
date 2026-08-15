/**
 * Campos de paciente que a importação entende, e como transformar o texto de
 * uma planilha de outro sistema em cada um deles.
 *
 * Cada campo declara os cabeçalhos que costuma ter por aí. A lista existe
 * porque não há formato padrão: a Feegow exporta um conjunto, o iClinic outro,
 * e a planilha que a secretária mantém no Excel é a terceira variante — e é a
 * mais comum de todas.
 *
 * Nada aqui toca no banco: tudo é função pura, para poder ser testado sem subir
 * arquivo nenhum.
 */

import { normalizarTexto } from '@/lib/buscaPaciente';

export type CampoDePaciente =
  | 'nome' | 'cpf' | 'data_nascimento' | 'telefone' | 'email' | 'sexo'
  | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'estado'
  | 'nome_responsavel' | 'cpf_responsavel' | 'numero_carteira' | 'observacoes';

export type CampoDeAgendamento =
  | 'paciente_nome' | 'paciente_cpf' | 'paciente_nascimento'
  | 'data' | 'hora_inicio' | 'medico_nome' | 'tipo' | 'status' | 'observacoes';

export type NomeDoCampo = CampoDePaciente | CampoDeAgendamento;

export interface Campo {
  nome: NomeDoCampo;
  rotulo: string;
  obrigatorio?: boolean;
  /** Cabeçalhos conhecidos, já normalizados (minúsculo, sem acento). */
  apelidos: string[];
  /** Converte o texto da célula. Devolve erro quando o valor não serve. */
  converter: (bruto: string) => { valor: any; erro?: string };
}

/**
 * minúsculo, sem acento, sem pontuação, espaços colapsados.
 *
 * Reusa o `normalizarTexto` da busca de paciente — é o mesmo problema (comparar
 * texto digitado por gente diferente) e ter dois normalizadores diferentes no
 * app seria pedir para eles divergirem.
 */
export function normalizarCabecalho(texto: string): string {
  return normalizarTexto(String(texto ?? ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const apenasDigitos = (v: string): string => String(v ?? '').replace(/\D/g, '');

/** Dígitos verificadores do CPF. Rejeita os 11 dígitos repetidos. */
export function cpfValido(cpf: string): boolean {
  const d = apenasDigitos(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/**
 * Data para 'yyyy-mm-dd' — texto, nunca `Date`.
 *
 * Usar `new Date('01/02/2026')` aqui produziria o bug de fuso que já custou 19
 * correções neste app: a data volta um dia para quem está em UTC-3.
 *
 * Aceita dd/mm/aaaa (o formato do Brasil e o que a Feegow exporta), aaaa-mm-dd
 * e o número de série do Excel, que aparece quando a planilha vem em .xlsx com
 * a coluna formatada como data.
 */
export function converterData(bruto: string): { valor: string | null; erro?: string } {
  const texto = String(bruto ?? '').trim();
  if (!texto) return { valor: null };

  // Número de série do Excel: dias desde 30/12/1899.
  if (/^\d{5}$/.test(texto)) {
    const serie = Number(texto);
    const ms = Date.UTC(1899, 11, 30) + serie * 86400000;
    const d = new Date(ms);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return { valor: iso };
  }

  const so = texto.split(/[T ]/)[0];

  let ano: number, mes: number, dia: number;
  const iso = so.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const br  = so.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);

  if (iso) {
    [, ano, mes, dia] = [0, Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (br) {
    dia = Number(br[1]); mes = Number(br[2]); ano = Number(br[3]);
    // Ano de dois dígitos: 30 vira 2030, 31 vira 1931. Data de nascimento
    // costuma ser passado, e paciente de 1931 é mais provável que de 2031.
    if (ano < 100) ano = ano <= 30 ? 2000 + ano : 1900 + ano;
  } else {
    return { valor: null, erro: `data não reconhecida: "${texto}"` };
  }

  if (mes < 1 || mes > 12) return { valor: null, erro: `mês inválido em "${texto}"` };
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia < 1 || dia > ultimoDia) return { valor: null, erro: `dia inválido em "${texto}"` };
  if (ano < 1900 || ano > 2100) return { valor: null, erro: `ano fora da faixa em "${texto}"` };

  return { valor: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}

const texto = (bruto: string) => {
  const v = String(bruto ?? '').replace(/\s+/g, ' ').trim();
  return { valor: v || null };
};

export const CAMPOS_PACIENTE: Campo[] = [
  {
    nome: 'nome', rotulo: 'Nome', obrigatorio: true,
    apelidos: ['nome', 'nome completo', 'nome do paciente', 'paciente', 'nome paciente', 'cliente'],
    converter: (b) => {
      const v = String(b ?? '').replace(/\s+/g, ' ').trim();
      if (!v) return { valor: null, erro: 'nome vazio' };
      if (v.length < 2) return { valor: null, erro: `nome muito curto: "${v}"` };
      return { valor: v };
    },
  },
  {
    nome: 'cpf', rotulo: 'CPF',
    apelidos: ['cpf', 'cpf do paciente', 'documento', 'cpf cnpj', 'n documento'],
    converter: (b) => {
      const d = apenasDigitos(b);
      if (!d) return { valor: null };
      if (d.length !== 11) return { valor: null, erro: `CPF com ${d.length} dígitos: "${b}"` };
      if (!cpfValido(d)) return { valor: null, erro: `CPF inválido: "${b}"` };
      return { valor: d };
    },
  },
  {
    nome: 'data_nascimento', rotulo: 'Nascimento',
    apelidos: ['data nascimento', 'data de nascimento', 'nascimento', 'dt nascimento', 'dtnasc', 'aniversario'],
    converter: (b) => converterData(b),
  },
  {
    nome: 'telefone', rotulo: 'Telefone',
    apelidos: ['telefone', 'celular', 'fone', 'telefone celular', 'whatsapp', 'contato', 'tel', 'telefone 1'],
    converter: (b) => {
      const d = apenasDigitos(b);
      if (!d) return { valor: null };
      const semPais = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
      if (semPais.length < 10 || semPais.length > 11) {
        return { valor: null, erro: `telefone com ${semPais.length} dígitos: "${b}"` };
      }
      return { valor: semPais };
    },
  },
  {
    nome: 'email', rotulo: 'E-mail',
    apelidos: ['email', 'e mail', 'correio eletronico'],
    converter: (b) => {
      const v = String(b ?? '').trim().toLowerCase();
      if (!v) return { valor: null };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { valor: null, erro: `e-mail inválido: "${b}"` };
      return { valor: v };
    },
  },
  {
    nome: 'sexo', rotulo: 'Sexo',
    apelidos: ['sexo', 'genero', 'sexo biologico'],
    converter: (b) => {
      const v = normalizarCabecalho(b);
      if (!v) return { valor: null };
      if (['m', 'masc', 'masculino', 'homem', '1'].includes(v)) return { valor: 'M' };
      if (['f', 'fem', 'feminino', 'mulher', '2'].includes(v)) return { valor: 'F' };
      if (['o', 'outro', 'outros', 'nao informado', 'n a', 'indefinido', '3'].includes(v)) return { valor: 'O' };
      // O banco só aceita M, F ou O; qualquer outra coisa seria recusada na hora
      // do insert, com uma mensagem que ninguém no balcão entende.
      return { valor: null, erro: `sexo não reconhecido: "${b}"` };
    },
  },
  {
    nome: 'cep', rotulo: 'CEP',
    apelidos: ['cep', 'codigo postal'],
    converter: (b) => {
      const d = apenasDigitos(b);
      if (!d) return { valor: null };
      if (d.length !== 8) return { valor: null, erro: `CEP com ${d.length} dígitos: "${b}"` };
      return { valor: d };
    },
  },
  { nome: 'logradouro', rotulo: 'Endereço', apelidos: ['logradouro', 'endereco', 'rua', 'end'], converter: texto },
  { nome: 'numero', rotulo: 'Número', apelidos: ['numero', 'num', 'n', 'nro'], converter: texto },
  { nome: 'complemento', rotulo: 'Complemento', apelidos: ['complemento', 'compl'], converter: texto },
  { nome: 'bairro', rotulo: 'Bairro', apelidos: ['bairro'], converter: texto },
  { nome: 'cidade', rotulo: 'Cidade', apelidos: ['cidade', 'municipio'], converter: texto },
  {
    nome: 'estado', rotulo: 'UF',
    apelidos: ['estado', 'uf', 'sigla estado'],
    converter: (b) => {
      const v = String(b ?? '').trim().toUpperCase();
      if (!v) return { valor: null };
      if (v.length === 2 && UFS.includes(v)) return { valor: v };
      return { valor: null, erro: `UF não reconhecida: "${b}"` };
    },
  },
  { nome: 'nome_responsavel', rotulo: 'Responsável', apelidos: ['responsavel', 'nome responsavel', 'nome do responsavel', 'mae', 'nome da mae'], converter: texto },
  {
    nome: 'cpf_responsavel', rotulo: 'CPF do responsável',
    apelidos: ['cpf responsavel', 'cpf do responsavel'],
    converter: (b) => {
      const d = apenasDigitos(b);
      if (!d) return { valor: null };
      if (d.length !== 11 || !cpfValido(d)) return { valor: null, erro: `CPF do responsável inválido: "${b}"` };
      return { valor: d };
    },
  },
  { nome: 'numero_carteira', rotulo: 'Carteirinha', apelidos: ['carteirinha', 'numero carteira', 'matricula', 'numero da carteirinha', 'convenio numero'], converter: texto },
  { nome: 'observacoes', rotulo: 'Observações', apelidos: ['observacoes', 'observacao', 'obs', 'anotacoes'], converter: texto },
];

export const CAMPO_POR_NOME: Record<string, Campo> =
  Object.fromEntries(CAMPOS_PACIENTE.map(c => [c.nome, c]));

// ═══════════════════════════════════════════════════════════════════════════
// AGENDAMENTOS
//
// Importar a agenda é o que faz a clínica conseguir usar o sistema no dia
// seguinte à migração. Sem ela, a recepção abre o app e vê um dia vazio
// enquanto a sala de espera enche.
//
// A diferença para pacientes: aqui as linhas APONTAM para cadastros que já
// precisam existir. Paciente que não estiver na base não vira agendamento —
// criar um paciente "João" a partir de uma linha de agenda produziria
// duplicata sem CPF nem nascimento, que é justamente o que a importação de
// pacientes evita.
// ═══════════════════════════════════════════════════════════════════════════

/** 'HH:MM' a partir de 14:30, 14h30, 1430 ou da fração de dia do Excel. */
export function converterHora(bruto: string): { valor: string | null; erro?: string } {
  const texto = String(bruto ?? '').trim();
  if (!texto) return { valor: null };

  // Excel guarda hora como fração do dia: 0,5 = meio-dia.
  if (/^0?[.,]\d+$/.test(texto)) {
    const fracao = Number(texto.replace(',', '.'));
    const total = Math.round(fracao * 24 * 60);
    return { valor: `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` };
  }

  // Data com hora junto ("2026-08-15 14:30" ou "15/08/2026 14:30").
  const comData = texto.match(/(\d{1,2})[:h](\d{2})/);
  if (comData) {
    const h = Number(comData[1]);
    const m = Number(comData[2]);
    if (h > 23 || m > 59) return { valor: null, erro: `hora fora da faixa: "${texto}"` };
    return { valor: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }

  // "1430" sem separador.
  const seco = texto.match(/^(\d{1,2})(\d{2})$/);
  if (seco) {
    const h = Number(seco[1]);
    const m = Number(seco[2]);
    if (h > 23 || m > 59) return { valor: null, erro: `hora fora da faixa: "${texto}"` };
    return { valor: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }

  return { valor: null, erro: `hora não reconhecida: "${texto}"` };
}

/**
 * Status do sistema de origem → o nosso.
 *
 * Cada sistema chama de um jeito, e o que não reconhecer entra como
 * `agendado` — o estado mais neutro. Chutar "finalizado" faria a clínica
 * migrar com atendimentos dados como concluídos que nunca aconteceram.
 */
export function converterStatus(bruto: string): { valor: string; erro?: string } {
  const v = normalizarCabecalho(bruto);
  if (!v) return { valor: 'agendado' };
  if (['cancelado', 'cancelada', 'desmarcado', 'desmarcada'].includes(v)) return { valor: 'cancelado' };
  if (['faltou', 'falta', 'nao compareceu', 'ausente', 'no show'].includes(v)) return { valor: 'faltou' };
  if (['confirmado', 'confirmada'].includes(v)) return { valor: 'confirmado' };
  if (['atendido', 'atendida', 'finalizado', 'finalizada', 'realizado', 'realizada', 'concluido', 'concluida'].includes(v))
    return { valor: 'finalizado' };
  if (['agendado', 'agendada', 'marcado', 'marcada', 'aberto'].includes(v)) return { valor: 'agendado' };
  return { valor: 'agendado', erro: `status "${bruto}" não reconhecido, importado como Agendado` };
}

export const CAMPOS_AGENDAMENTO: Campo[] = [
  {
    nome: 'paciente_nome', rotulo: 'Paciente', obrigatorio: true,
    apelidos: ['paciente', 'nome', 'nome do paciente', 'nome paciente', 'cliente', 'nome completo'],
    converter: (b) => {
      const v = String(b ?? '').replace(/\s+/g, ' ').trim();
      return v ? { valor: v } : { valor: null, erro: 'paciente vazio' };
    },
  },
  {
    nome: 'paciente_cpf', rotulo: 'CPF do paciente',
    apelidos: ['cpf', 'cpf do paciente', 'documento'],
    converter: (b) => {
      const d = apenasDigitos(b);
      if (!d) return { valor: null };
      if (d.length !== 11) return { valor: null, erro: `CPF com ${d.length} dígitos` };
      return { valor: d };
    },
  },
  {
    nome: 'paciente_nascimento', rotulo: 'Nascimento do paciente',
    apelidos: ['data nascimento', 'data de nascimento', 'nascimento', 'dtnasc'],
    converter: (b) => converterData(b),
  },
  {
    nome: 'data', rotulo: 'Data', obrigatorio: true,
    apelidos: ['data', 'data agendamento', 'data da consulta', 'dia', 'data atendimento'],
    converter: (b) => {
      const r = converterData(b);
      if (!r.valor && !r.erro) return { valor: null, erro: 'data vazia' };
      return r;
    },
  },
  {
    nome: 'hora_inicio', rotulo: 'Hora', obrigatorio: true,
    apelidos: ['hora', 'horario', 'hora inicio', 'hora de inicio', 'hora agendamento', 'hr'],
    converter: (b) => {
      const r = converterHora(b);
      if (!r.valor && !r.erro) return { valor: null, erro: 'hora vazia' };
      return r;
    },
  },
  {
    nome: 'medico_nome', rotulo: 'Profissional',
    apelidos: ['medico', 'profissional', 'doutor', 'dentista', 'nome do medico', 'prestador', 'responsavel'],
    converter: texto,
  },
  { nome: 'tipo', rotulo: 'Tipo', apelidos: ['tipo', 'tipo consulta', 'procedimento', 'servico', 'especialidade'], converter: texto },
  {
    nome: 'status', rotulo: 'Situação',
    apelidos: ['status', 'situacao', 'estado'],
    converter: (b) => {
      const r = converterStatus(b);
      return { valor: r.valor, erro: r.erro };
    },
  },
  { nome: 'observacoes', rotulo: 'Observações', apelidos: ['observacoes', 'observacao', 'obs', 'anotacoes'], converter: texto },
];
