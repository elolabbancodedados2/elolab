import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  insert: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock('@/lib/erros', () => ({ mensagemDeErro: (error: unknown) => String(error) }));

import { MedicoAvailabilityManager } from '@/components/medicos/MedicoAvailabilityManager';

describe('MedicoAvailabilityManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [];
    mocks.insert.mockImplementation(async (row: Record<string, unknown>) => {
      mocks.rows.push({ id: 'sunday-availability', ...row });
      return { error: null };
    });
    mocks.from.mockImplementation(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(async () => ({ data: mocks.rows, error: null })),
        insert: mocks.insert,
      };
      return query;
    });
  });

  it('carrega os horários existentes ao abrir a edição do profissional', async () => {
    mocks.rows = [{
      id: 'monday-availability',
      dia_semana: 1,
      hora_inicio: '09:00',
      hora_fim: '12:00',
      duracao_consulta: 30,
      intervalo_consultas: 5,
      ativo: true,
    }];

    render(<MedicoAvailabilityManager medico_id="medico-1" medico_nome="Dra. Ana" />);

    expect(await screen.findByText('Segunda-feira')).toBeVisible();
    expect(screen.getByText((_, element) =>
      element?.textContent === '09:00 — 12:00 (30 min por consulta + 5 min de intervalo)'
    )).toBeVisible();
  });

  it('permite salvar domingo, cujo dia da semana é zero', async () => {
    render(<MedicoAvailabilityManager medico_id="medico-1" medico_nome="Dra. Ana" />);
    await screen.findByText('Nenhuma disponibilidade configurada');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar novo horário' }));
    fireEvent.change(screen.getByLabelText('Dia da semana'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Preencha todos os campos obrigatórios');

    fireEvent.change(screen.getByLabelText('Dia da semana'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Horário de início'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Horário de término'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      medico_id: 'medico-1',
      dia_semana: 0,
      hora_inicio: '09:00',
      hora_fim: '12:00',
    })));
    expect(await screen.findByText('Domingo')).toBeVisible();
  });

  it('não envia uma faixa em que o fim seja igual ou anterior ao início', async () => {
    render(<MedicoAvailabilityManager medico_id="medico-1" medico_nome="Dra. Ana" />);
    await screen.findByText('Nenhuma disponibilidade configurada');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar novo horário' }));
    fireEvent.change(screen.getByLabelText('Dia da semana'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Horário de início'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Horário de término'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('O horário de término deve ser posterior ao início.');
  });
});
