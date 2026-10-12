import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { lerArquivo } = vi.hoisted(() => ({ lerArquivo: vi.fn() }));

vi.mock('@/lib/importacao/planilha', () => ({ lerArquivo }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { ImportadorDePlanilha } from './ImportadorDePlanilha';

describe('Importador de planilhas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });

  it('oferece os campos de agenda para mapear colunas de agenda', async () => {
    lerArquivo.mockResolvedValue({
      cabecalhos: ['Data da consulta', 'Hora', 'Profissional', 'Paciente'],
      linhas: [['12/10/2026', '09:00', 'Dra. Ana', 'João Silva']],
    });
    render(<ImportadorDePlanilha />);

    fireEvent.click(screen.getByRole('button', { name: /Agenda/ }));
    const file = new File(['planilha'], 'agenda.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(/Escolher planilha/), { target: { files: [file] } });

    await screen.findByText('agenda.csv');
    const selects = screen.getAllByRole('combobox');
    fireEvent.click(selects[0]);
    const menu = await screen.findByRole('listbox');

    expect(within(menu).getByText('Data *')).toBeInTheDocument();
    expect(within(menu).getByText('Hora *')).toBeInTheDocument();
    expect(within(menu).getByText('Profissional')).toBeInTheDocument();
  });
});
