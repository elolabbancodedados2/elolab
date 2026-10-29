import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ role: 'recepcao' }));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({ hasAnyRole: (roles: string[]) => roles.includes(mocks.role) }),
}));
vi.mock('@/pages/Fila', () => ({ default: () => <div>Conteúdo da fila</div> }));
vi.mock('@/pages/Triagem', () => ({ default: () => <div>Conteúdo da triagem</div> }));

import AtendimentoFila from '@/pages/AtendimentoFila';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/fila" element={<><AtendimentoFila /><LocationOutput /></>} /></Routes>
    </MemoryRouter>,
  );
}

function LocationOutput() {
  const location = useLocation();
  return <output aria-label="Localização atual">{location.pathname}{location.search}</output>;
}

describe('Acesso ao módulo Fila e Triagem', () => {
  beforeEach(() => { mocks.role = 'recepcao'; });

  it('não oferece nem monta Triagem para recepção, mesmo com link direto', async () => {
    renderAt('/fila?tab=triagem');
    expect(screen.queryByRole('tab', { name: 'Triagem' })).not.toBeInTheDocument();
    expect(await screen.findByText('Conteúdo da fila')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo da triagem')).not.toBeInTheDocument();
  });

  it('mantém Triagem disponível para enfermagem', async () => {
    mocks.role = 'enfermagem';
    renderAt('/fila?tab=triagem');
    expect(screen.getByRole('tab', { name: 'Triagem' })).toBeInTheDocument();
    expect(await screen.findByText('Conteúdo da triagem')).toBeInTheDocument();
  });

  it('preserva o contexto do paciente e do agendamento ao alternar as abas', async () => {
    const user = userEvent.setup();
    mocks.role = 'medico';
    renderAt('/fila?tab=triagem&paciente=paciente-123&agendamento=agenda-456&origem=recepcao');

    await user.click(screen.getByRole('tab', { name: 'Fila' }));
    await waitFor(() => expect(screen.getByLabelText('Localização atual')).toHaveTextContent(
      '/fila?paciente=paciente-123&agendamento=agenda-456&origem=recepcao',
    ));

    await user.click(screen.getByRole('tab', { name: 'Triagem' }));
    await waitFor(() => expect(screen.getByLabelText('Localização atual')).toHaveTextContent(
      '/fila?paciente=paciente-123&agendamento=agenda-456&origem=recepcao&tab=triagem',
    ));
  });

  it('usa os tokens EloLab na navegação local', () => {
    renderAt('/fila');
    const tabList = screen.getByRole('tablist');
    expect(tabList).toHaveClass('border-border', 'bg-muted');
    expect(tabList.className).not.toMatch(/#(?:[\da-f]{3,8})\b/i);
  });

  it('permite alternar entre fila e triagem pelo teclado', async () => {
    const user = userEvent.setup();
    mocks.role = 'medico';
    renderAt('/fila');
    const filaTab = screen.getByRole('tab', { name: 'Fila' });
    const triagemTab = screen.getByRole('tab', { name: 'Triagem' });

    filaTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(triagemTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByLabelText('Localização atual')).toHaveTextContent('/fila?tab=triagem'));

    await user.keyboard('{ArrowLeft}');
    expect(filaTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByLabelText('Localização atual')).toHaveTextContent('/fila'));
  });
});
