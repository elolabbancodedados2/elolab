import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ roles: ['recepcao'] as string[] }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    profile: { roles: auth.roles, clinica_id: 'c1' },
    isAdmin: () => auth.roles.includes('admin'),
    isSuperAdmin: false,
  }),
}));
vi.mock('@/hooks/useSubscriptionPlan', () => ({ useUserPlan: () => ({ hasFeature: () => true, isLoading: false, isError: false }) }));

import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

let caminhoAtual = '';
function Sonda() {
  useKeyboardShortcuts();
  const location = useLocation();
  caminhoAtual = `${location.pathname}${location.search}`;
  return (
    <div>
      <input aria-label="campo" />
      <div contentEditable suppressContentEditableWarning data-testid="editor">texto</div>
      <div role="dialog"><button type="button">dentro do diálogo</button></div>
    </div>
  );
}

function renderSonda() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes><Route path="*" element={<Sonda />} /></Routes>
    </MemoryRouter>,
  );
}

describe('atalhos Alt', () => {
  beforeEach(() => { auth.roles = ['recepcao']; });

  it('usa a tecla física (event.code), como no Mac com Option', () => {
    renderSonda();
    fireEvent.keyDown(document.body, { key: 'π', code: 'KeyP', altKey: true });
    expect(caminhoAtual).toBe('/pacientes');
  });

  it('não oferece destino fora do papel', () => {
    renderSonda();
    fireEvent.keyDown(document.body, { key: 'r', code: 'KeyR', altKey: true });
    expect(caminhoAtual).toBe('/dashboard');
  });

  it('leva à rota final de atestados para o médico', () => {
    auth.roles = ['medico'];
    renderSonda();
    fireEvent.keyDown(document.body, { key: 't', code: 'KeyT', altKey: true });
    expect(caminhoAtual).toBe('/documentos-clinicos?tab=atestados');
  });

  it('ignora atalhos digitados em campo, área editável ou diálogo', () => {
    const { getByLabelText, getByTestId, getByRole } = renderSonda();
    fireEvent.keyDown(getByLabelText('campo'), { key: 'p', code: 'KeyP', altKey: true });
    fireEvent.keyDown(getByTestId('editor'), { key: 'p', code: 'KeyP', altKey: true });
    fireEvent.keyDown(getByRole('button', { name: 'dentro do diálogo' }), { key: 'p', code: 'KeyP', altKey: true });
    expect(caminhoAtual).toBe('/dashboard');
  });
});
