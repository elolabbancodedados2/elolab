import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendentesTriagem } from './PendentesTriagem';

describe('lista de pacientes aguardando triagem', () => {
  it('mostra carregamento em vez de uma lista aparentemente vazia', () => {
    render(<PendentesTriagem loading appointments={[]} onTriage={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando pacientes aguardando triagem');
  });

  it('abre triagem para o paciente selecionado', () => {
    const onTriage = vi.fn();
    render(<PendentesTriagem loading={false} appointments={[
      { id: 'ag-1', paciente_id: 'pac-1', hora_inicio: '09:30', tipo: 'consulta', pacientes: { nome: 'Ana' } },
    ]} onTriage={onTriage} />);

    fireEvent.click(screen.getByRole('button', { name: 'Triar Ana' }));
    expect(onTriage).toHaveBeenCalledWith('pac-1', 'ag-1');
  });

  it('explica quando não há pacientes aguardando triagem', () => {
    render(<PendentesTriagem loading={false} appointments={[]} onTriage={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nenhum paciente aguardando triagem');
  });
});
