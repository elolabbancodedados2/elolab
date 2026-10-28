import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IdentificacaoPaciente } from '@/components/clinical/IdentificacaoPaciente';
import { descreverIdade, mascararCpf } from '@/lib/identificacaoPaciente';

// Dados sintéticos.
const paciente = {
  nome: 'Maria Aparecida dos Santos Oliveira',
  data_nascimento: '1980-03-15',
  cpf: '123.456.789-09',
  alergias: ['Dipirona', 'Penicilina'],
};

function regiao() {
  return screen.getByRole('region', { name: 'Identificação do paciente' });
}

describe('mascararCpf', () => {
  it('mantém só os dois últimos dígitos', () => {
    expect(mascararCpf('123.456.789-09')).toBe('***.***.***-09');
    expect(mascararCpf('12345678909')).toBe('***.***.***-09');
  });

  it('não exibe CPF incompleto ou ausente', () => {
    expect(mascararCpf('1234')).toBeNull();
    expect(mascararCpf(null)).toBeNull();
    expect(mascararCpf(undefined)).toBeNull();
  });
});

describe('descreverIdade', () => {
  const hoje = new Date(2026, 9, 27, 12);

  it('calcula anos considerando o aniversário ainda não ocorrido', () => {
    expect(descreverIdade('1980-03-15', hoje)).toBe('46 anos');
    expect(descreverIdade('1980-10-28', hoje)).toBe('45 anos');
    expect(descreverIdade('2025-10-27', hoje)).toBe('1 ano');
  });

  it('usa meses para menores de 1 ano', () => {
    expect(descreverIdade('2026-09-27', hoje)).toBe('1 mês');
    expect(descreverIdade('2026-04-10', hoje)).toBe('6 meses');
    expect(descreverIdade('2026-02-27', hoje)).toBe('8 meses');
  });

  it('usa dias para menores de 1 mês', () => {
    expect(descreverIdade('2026-10-15', hoje)).toBe('12 dias');
    expect(descreverIdade('2026-10-26', hoje)).toBe('1 dia');
    expect(descreverIdade('2026-10-27', hoje)).toBe('0 dias');
  });

  it('calcula a idade do exemplo da especificação', () => {
    expect(descreverIdade('1958-05-03', hoje)).toBe('68 anos');
  });

  it('não devolve idade negativa nem para data inválida', () => {
    expect(descreverIdade('2026-11-30', hoje)).toBe('0 dias');
    expect(descreverIdade('data-invalida', hoje)).toBeNull();
  });
});

describe('IdentificacaoPaciente', () => {
  it('exibe nome completo, nascimento, idade, CPF mascarado e alergias', () => {
    render(<IdentificacaoPaciente paciente={paciente} />);
    const r = within(regiao());

    expect(r.getByText('Maria Aparecida dos Santos Oliveira')).toBeInTheDocument();
    expect(r.getByText('15/03/1980')).toBeInTheDocument();
    expect(r.getByText(/^\d+ anos$/)).toBeInTheDocument();
    expect(r.getByText('***.***.***-09')).toBeInTheDocument();
    expect(r.queryByText(/123\.456\.789/)).not.toBeInTheDocument();

    const lista = r.getByRole('list', { name: 'Alergias registradas' });
    expect(within(lista).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'Dipirona',
      'Penicilina',
    ]);
    expect(r.getByText('Atenção: paciente com alergias registradas.')).toBeInTheDocument();
  });

  it('associa cada valor ao seu rótulo em lista de definição', () => {
    render(<IdentificacaoPaciente paciente={paciente} />);
    const rotulos = within(regiao()).getAllByRole('term').map((t) => t.textContent);
    expect(rotulos).toEqual(['Data de nascimento', 'Idade', 'CPF', 'Alergias']);
  });

  it('diferencia alergias não informadas de nenhuma alergia conhecida', () => {
    const { rerender } = render(
      <IdentificacaoPaciente paciente={{ ...paciente, alergias: null }} />,
    );
    expect(screen.getByText('Alergias não informadas')).toBeInTheDocument();

    rerender(<IdentificacaoPaciente paciente={{ ...paciente, alergias: [] }} />);
    expect(screen.getByText('Nenhuma alergia conhecida')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Alergias registradas' })).not.toBeInTheDocument();
  });

  it('informa dados ausentes sem inventar valores', () => {
    render(
      <IdentificacaoPaciente
        paciente={{ nome: 'João Pereira', data_nascimento: null, cpf: null }}
      />,
    );
    expect(screen.getByText('Não informada')).toBeInTheDocument();
    expect(screen.getByText('Não informado')).toBeInTheDocument();
    expect(screen.getAllByRole('term').map((t) => t.textContent)).not.toContain('Idade');
  });

  it('trata data de nascimento inválida como não informada', () => {
    render(<IdentificacaoPaciente paciente={{ ...paciente, data_nascimento: 'xx' }} />);
    expect(screen.getByText('Não informada')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid/)).not.toBeInTheDocument();
  });

  it('exibe nome social e convênio quando fornecidos', () => {
    render(
      <IdentificacaoPaciente
        paciente={{ ...paciente, nome_social: 'Cida', convenio: 'Convênio Exemplo' }}
      />,
    );
    expect(screen.getByText('Nome social: Cida')).toBeInTheDocument();
    expect(screen.getByText('Convênio Exemplo')).toBeInTheDocument();
  });

  it('mostra Particular quando o convênio é informado como vazio', () => {
    render(<IdentificacaoPaciente paciente={{ ...paciente, convenio: null }} />);
    expect(screen.getByText('Particular')).toBeInTheDocument();
  });

  it('mostra estado de carregamento', () => {
    render(<IdentificacaoPaciente paciente={null} carregando />);
    expect(regiao()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Carregando identificação do paciente.')).toBeInTheDocument();
  });

  it('mostra estado vazio sem paciente', () => {
    render(<IdentificacaoPaciente paciente={null} />);
    expect(screen.getByText('Nenhum paciente selecionado.')).toBeInTheDocument();
  });
});

describe('IdentificacaoPaciente: variantes, contexto e estados adicionais', () => {
  it('variante diálogo mantém os rótulos para leitor de tela e o nome em 14 px', () => {
    render(<IdentificacaoPaciente paciente={paciente} variante="dialogo" />);
    const r = within(regiao());
    expect(r.getAllByRole('term').map((t) => t.textContent)).toEqual([
      'Data de nascimento',
      'Idade',
      'CPF',
      'Alergias',
    ]);
    const nome = r.getByText('Maria Aparecida dos Santos Oliveira');
    expect(nome).toHaveClass('text-sm', 'font-semibold');
    expect(r.getByText('***.***.***-09')).toBeInTheDocument();
  });

  it('na prescrição, alergias não informadas pedem confirmação', () => {
    render(
      <IdentificacaoPaciente paciente={{ ...paciente, alergias: null }} contexto="prescricao" />,
    );
    expect(
      screen.getByText('Alergias não informadas. Confirme com o paciente antes de prescrever.'),
    ).toBeInTheDocument();
  });

  it('não repete alergias duplicadas nem itens em branco', () => {
    render(
      <IdentificacaoPaciente paciente={{ ...paciente, alergias: ['Látex', ' Látex ', ''] }} />,
    );
    const lista = screen.getByRole('list', { name: 'Alergias registradas' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1);
  });

  it('mostra erro traduzido com ação de tentar novamente e sem dados do paciente', () => {
    const onTentarNovamente = vi.fn();
    render(
      <IdentificacaoPaciente
        paciente={paciente}
        erro={new Error('Failed to fetch')}
        onTentarNovamente={onTentarNovamente}
      />,
    );
    expect(
      screen.getByText(/^Não foi possível carregar a identificação do paciente\. Sem conexão/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Maria Aparecida dos Santos Oliveira')).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(onTentarNovamente).toHaveBeenCalledTimes(1);
  });

  it('anuncia a troca de paciente com a tela aberta', () => {
    const { rerender } = render(<IdentificacaoPaciente paciente={paciente} />);
    const vivo = regiao().querySelector('[aria-live="polite"]');
    expect(vivo).toHaveTextContent('');

    rerender(<IdentificacaoPaciente paciente={{ ...paciente, nome: 'João Pereira' }} />);
    expect(regiao().querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Paciente alterado para João Pereira.',
    );
  });

  it('não usa texto abaixo de 12 px nem animação', () => {
    const { container } = render(
      <IdentificacaoPaciente paciente={{ ...paciente, convenio: 'Convênio Exemplo' }} />,
    );
    const html = container.innerHTML;
    for (const proibido of ['text-[9px]', 'text-[10px]', 'text-[11px]', 'animate-pulse']) {
      expect(html).not.toContain(proibido);
    }
  });
});
