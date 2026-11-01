import { describe, expect, it } from 'vitest';
import {
  cpfMascarado, diferencasCadastro, duracaoDoTipo, formatarCpf, juntarLista, nomesDoPaciente, rotuloMotivoDuplicidade,
  rotuloStatusAgendamento, rotuloStatusExame, rotuloTipoAgendamento, separarConsultas, separarLista, sexoPorExtenso,
  situacaoCarteirinha, textoIdade,
} from '@/lib/pacienteFicha';

describe('separarLista', () => {
  it('aceita vírgula, ponto e vírgula e quebra de linha, sem itens vazios nem repetidos', () => {
    expect(separarLista('Penicilina, , Dipirona;Látex\npenicilina ')).toEqual(['Penicilina', 'Dipirona', 'Látex']);
    expect(separarLista('')).toEqual([]);
    expect(separarLista(null)).toEqual([]);
  });

  it('não inventa "Alergia" para item vazio', () => {
    expect(separarLista(',,')).toEqual([]);
  });

  it('volta ao texto com vírgula e espaço', () => {
    expect(juntarLista(['A', 'B'])).toBe('A, B');
  });
});

describe('rótulos', () => {
  it('traduz status e tipo crus', () => {
    expect(rotuloStatusAgendamento('em_atendimento')).toBe('Em atendimento');
    expect(rotuloStatusAgendamento('finalizado')).toBe('Realizada');
    expect(rotuloStatusAgendamento('novo_status_x')).toBe('Novo status x');
    expect(rotuloTipoAgendamento('coleta')).toBe('Coleta laboratorial');
    expect(rotuloTipoAgendamento(null)).toBe('Consulta');
    expect(rotuloStatusExame('laudo_disponivel')).toBe('Laudo disponível');
  });

  it('sexo por extenso e idade em anos', () => {
    expect(sexoPorExtenso('F')).toBe('Feminino');
    expect(sexoPorExtenso('')).toBeNull();
    const ref = new Date(2026, 10, 1);
    expect(textoIdade('1992-01-15', ref)).toBe('34 anos');
    expect(textoIdade('2025-10-01', ref)).toBe('1 ano');
    expect(textoIdade('2026-05-01', ref)).toBe('Menos de 1 ano');
    expect(textoIdade(null, ref)).toBe('Idade não informada');
    expect(textoIdade('2026-02-31', ref)).toBe('Nascimento inválido');
  });

  it('destaca o nome social e mantém o de registro como apoio', () => {
    expect(nomesDoPaciente({ nome: 'João da Silva', nome_social: 'Joana' })).toEqual({ principal: 'Joana', registro: 'João da Silva' });
    expect(nomesDoPaciente({ nome: 'Ana', nome_social: '' })).toEqual({ principal: 'Ana', registro: null });
  });

  it('motivos de duplicidade', () => {
    expect(rotuloMotivoDuplicidade('telefone')).toBe('Mesmo telefone');
    expect(rotuloMotivoDuplicidade('nome_data_nascimento')).toBe('Mesmo nome e nascimento');
  });
});

describe('CPF', () => {
  it('formata com máscara e mascara para exibição', () => {
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
    expect(formatarCpf('123.456.789-09')).toBe('123.456.789-09');
    expect(cpfMascarado('123.456.789-09')).toBe('***.456.789-**');
    expect(cpfMascarado('')).toBeNull();
  });
});

describe('situacaoCarteirinha', () => {
  it('avisa vencida e a vencer em 30 dias', () => {
    expect(situacaoCarteirinha('2026-10-30', '2026-11-01')).toEqual({ nivel: 'vencida', texto: 'Carteirinha vencida há 2 dias', dias: -2 });
    expect(situacaoCarteirinha('2026-11-01', '2026-11-01')?.texto).toBe('Carteirinha vence hoje');
    expect(situacaoCarteirinha('2026-11-11', '2026-11-01')?.nivel).toBe('vence_em_breve');
    expect(situacaoCarteirinha('2027-06-01', '2026-11-01')).toBeNull();
    expect(situacaoCarteirinha(null, '2026-11-01')).toBeNull();
  });
});

describe('separarConsultas', () => {
  it('põe as futuras em ordem crescente e o histórico do mais recente', () => {
    const agora = new Date('2026-11-01T15:00:00Z'); // 12:00 em São Paulo
    const { proximas, historico } = separarConsultas([
      { id: 'a', data: '2026-11-05', hora_inicio: '09:00', status: 'agendado' },
      { id: 'b', data: '2026-11-02', hora_inicio: '09:00', status: 'confirmado' },
      { id: 'c', data: '2026-10-01', hora_inicio: '09:00', status: 'finalizado' },
      { id: 'd', data: '2026-11-01', hora_inicio: '08:00', status: 'agendado' },
      { id: 'e', data: '2026-11-10', hora_inicio: '08:00', status: 'cancelado' },
    ], agora);
    expect(proximas.map(c => c.id)).toEqual(['b', 'a']);
    expect(historico.map(c => c.id)).toEqual(['e', 'd', 'c']);
  });
});

describe('duracaoDoTipo', () => {
  it('usa a duração cadastrada pela clínica e cai na referência local', () => {
    expect(duracaoDoTipo('procedimento', [{ nome: 'Procedimento', duracao_minutos: 45 }])).toBe(45);
    expect(duracaoDoTipo('procedimento')).toBe(60);
    expect(duracaoDoTipo('desconhecido')).toBe(30);
  });
});

describe('diferencasCadastro', () => {
  it('lista só o que mudou e não repete o CPF', () => {
    const mudancas = diferencasCadastro(
      { nome: 'Ana', telefone: '1199', cpf: '111', alergias: [], email: null },
      { nome: 'Ana Souza', telefone: '1199', cpf: '222', alergias: ['Látex'], email: '' },
    );
    expect(mudancas).toEqual([
      { field: 'nome', oldValue: 'Ana', newValue: 'Ana Souza' },
      { field: 'cpf', oldValue: '(informado)', newValue: '(alterado)' },
      { field: 'alergias', oldValue: null, newValue: '["Látex"]' },
    ]);
  });
});
