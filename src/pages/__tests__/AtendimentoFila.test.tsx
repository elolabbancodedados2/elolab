import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
      <Routes><Route path="/fila" element={<AtendimentoFila />} /></Routes>
    </MemoryRouter>,
  );
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
});
