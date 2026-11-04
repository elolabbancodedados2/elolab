import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AtalhosDocumentos } from '../AtalhosDocumentos';

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('AtalhosDocumentos', () => {
  it.each(['Receita', 'Pedido de exame', 'Atestado', 'Encaminhamento'])('salva antes de abrir %s', async name => {
    let finish!: (id: string) => void;
    const beforeOpen = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const receita = vi.fn();
    render(<MemoryRouter initialEntries={['/prontuarios/novo']}><AtalhosDocumentos pacienteId="p1" agendamentoId="a1" beforeOpen={beforeOpen} onReceita={receita} /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(beforeOpen).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location')).toHaveTextContent('/prontuarios/novo');
    expect(receita).not.toHaveBeenCalled();
    finish('e1');
    await waitFor(() => {
      if (name === 'Receita') expect(receita).toHaveBeenCalledOnce();
      else {
        expect(screen.getByTestId('location')).not.toHaveTextContent('/prontuarios/novo');
        expect(screen.getByTestId('location')).toHaveTextContent('agendamento=a1');
        if (name === 'Pedido de exame') {
          expect(screen.getByTestId('location')).toHaveTextContent('prontuario=e1');
          expect(screen.getByTestId('location')).toHaveTextContent('voltar=prontuario');
        }
      }
    });
  });

  it.each(['Receita', 'Pedido de exame', 'Atestado', 'Encaminhamento'])('mantém a tela quando salvar falha: %s', async name => {
    const receita = vi.fn();
    render(<MemoryRouter initialEntries={['/prontuarios/novo']}><AtalhosDocumentos pacienteId="p1" beforeOpen={async () => false} onReceita={receita} /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());
    expect(screen.getByTestId('location')).toHaveTextContent('/prontuarios/novo');
    expect(receita).not.toHaveBeenCalled();
  });
});
