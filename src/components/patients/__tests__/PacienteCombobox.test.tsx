import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PacienteCombobox } from '../PacienteCombobox';
import { useBuscaPacientes, usePacienteResumo, type PacienteResumo } from '@/hooks/useBuscaPacientes';

vi.mock('@/hooks/useBuscaPacientes', () => ({
  useBuscaPacientes: vi.fn(),
  usePacienteResumo: vi.fn(),
}));

const pacienteAntigo: PacienteResumo = {
  id: 'paciente-anterior', nome: 'Ana Busca Anterior', nome_social: null,
  cpf: null, telefone: null, email: null, data_nascimento: null,
};
const scrollIntoViewOriginal = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  HTMLElement.prototype.scrollIntoView = scrollIntoViewOriginal;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('PacienteCombobox', () => {
  it('esconde opções da busca anterior enquanto o novo termo ainda está carregando', async () => {
    vi.mocked(useBuscaPacientes).mockReturnValue({
      data: { pacientes: [pacienteAntigo], incompleta: false }, isFetching: true, isPlaceholderData: true, isDebouncing: false,
    } as ReturnType<typeof useBuscaPacientes>);
    vi.mocked(usePacienteResumo).mockReturnValue({ data: null } as ReturnType<typeof usePacienteResumo>);

    render(<PacienteCombobox value={null} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('status')).toHaveTextContent('Buscando...');
    expect(screen.queryByText('Ana Busca Anterior')).not.toBeInTheDocument();
  });

  it('mantém o resultado da busca atual selecionável depois que o carregamento termina', async () => {
    vi.mocked(useBuscaPacientes).mockReturnValue({
      data: { pacientes: [{ ...pacienteAntigo, id: 'atual', nome: 'Ana Resultado Atual' }], incompleta: false },
      isFetching: false, isPlaceholderData: false, isDebouncing: false,
    } as ReturnType<typeof useBuscaPacientes>);
    vi.mocked(usePacienteResumo).mockReturnValue({ data: null } as ReturnType<typeof usePacienteResumo>);

    render(<PacienteCombobox value={null} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByText('Ana Resultado Atual')).toBeVisible();
  });

  it('avisa quando a busca precisou parar no limite de segurança', async () => {
    vi.mocked(useBuscaPacientes).mockReturnValue({
      data: { pacientes: [], incompleta: true }, isFetching: false, isPlaceholderData: false, isDebouncing: false,
    } as ReturnType<typeof useBuscaPacientes>);
    vi.mocked(usePacienteResumo).mockReturnValue({ data: null } as ReturnType<typeof usePacienteResumo>);

    render(<PacienteCombobox value={null} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByText(/Digite mais caracteres para refinar a busca/)).toBeVisible();
  });

  it('mostra erro e permite repetir a consulta mesmo com dados anteriores em cache', async () => {
    const refetch = vi.fn();
    vi.mocked(useBuscaPacientes).mockReturnValue({
      data: { pacientes: [pacienteAntigo], incompleta: false },
      isFetching: false, isPlaceholderData: true, isDebouncing: false, isError: true, refetch,
    } as unknown as ReturnType<typeof useBuscaPacientes>);
    vi.mocked(usePacienteResumo).mockReturnValue({ data: null } as ReturnType<typeof usePacienteResumo>);

    render(<PacienteCombobox value={null} onChange={() => undefined} />);
    await userEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar pacientes.');
    expect(screen.queryByText('Ana Busca Anterior')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
