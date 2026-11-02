import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  patientMaybeSingle: vi.fn(),
  consentOrder: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  insertSelect: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('@/lib/avisos', () => ({ avisar: mocks.toast }));
vi.mock('@/components/UnsavedChangesGuard', () => ({ UnsavedChangesGuard: () => null }));

import ConsentimentoLGPDTaskPage from '@/pages/ConsentimentoLGPDTaskPage';

const consentimentoAceito = {
  id: 'consent-1',
  tipo_consentimento: 'tratamento_dados',
  versao_termo: '1.0',
  aceito: true,
  data_aceite: '2026-01-01T12:00:00Z',
  revogado: false,
  data_revogacao: null,
  motivo_revogacao: null,
};

function PatientReturn() {
  const location = useLocation();
  return <p data-testid="returned-to-patient">{`${location.pathname}${location.search}|${location.state?.patientFilters?.search || ''}`}</p>;
}

function renderTask(path: string | { pathname: string; search?: string; state?: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/pacientes/:patientId/consentimentos/novo', element: <ConsentimentoLGPDTaskPage task="novo" /> },
    { path: '/pacientes/:patientId/consentimentos/:consentType/revogar', element: <ConsentimentoLGPDTaskPage task="revogar" /> },
    { path: '/pacientes', element: <PatientReturn /> },
    { path: '/pacientes/:patientId', element: <PatientReturn /> },
  ], { initialEntries: [path] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ConsentimentoLGPDTaskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const patientQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: mocks.patientMaybeSingle,
    };
    patientQuery.select.mockReturnValue(patientQuery);
    patientQuery.eq.mockReturnValue(patientQuery);

    const consentQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: mocks.consentOrder,
      insert: mocks.insert,
      update: mocks.update,
    };
    consentQuery.select.mockReturnValue(consentQuery);
    consentQuery.eq.mockReturnValue(consentQuery);
    mocks.from.mockImplementation((table: string) => table === 'pacientes' ? patientQuery : consentQuery);
    mocks.patientMaybeSingle.mockResolvedValue({ data: { id: 'pac-1', nome: 'Ana', nome_social: null }, error: null });
    mocks.consentOrder.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockReturnValue({ select: mocks.insertSelect });
    mocks.insertSelect.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: 'consent-new' }, error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.updateEq.mockReturnValue({ select: mocks.updateSelect });
    mocks.updateSelect.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'consent-1' }, error: null });
  });

  it('records selected consent on its own page and returns to the patient', async () => {
    renderTask('/pacientes/pac-1/consentimentos/novo');

    expect(await screen.findByRole('heading', { name: 'Novo consentimento' })).toBeVisible();
    await waitFor(() => expect(mocks.patientMaybeSingle).toHaveBeenCalled());
    await waitFor(() => expect(mocks.consentOrder).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Tratamento de Dados Pessoais/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Comunicações e Marketing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      paciente_id: 'pac-1',
      tipo_consentimento: 'comunicacao_marketing',
      versao_termo: '1.0',
      aceito: true,
    })));
    expect(await screen.findByTestId('returned-to-patient')).toBeVisible();
  });

  it('exige o tratamento de dados antes dos demais consentimentos', async () => {
    renderTask('/pacientes/pac-1/consentimentos/novo');

    await waitFor(() => expect(mocks.consentOrder).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Comunicações e Marketing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    expect(await screen.findByText(/ele é obrigatório para registrar os demais consentimentos/)).toBeVisible();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('dispensa o tratamento de dados quando ele já foi aceito', async () => {
    mocks.consentOrder.mockResolvedValue({ data: [consentimentoAceito], error: null });
    renderTask('/pacientes/pac-1/consentimentos/novo');

    await waitFor(() => expect(mocks.consentOrder).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Comunicações e Marketing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo_consentimento: 'comunicacao_marketing' })));
  });

  it('restores the patient list search context when returning from the task page', async () => {
    renderTask({
      pathname: '/pacientes/pac-1/consentimentos/novo',
      state: {
        consentReturnTo: '/pacientes?paciente=pac-1&tab=lgpd',
        consentReturnState: { patientFilters: { search: 'Ana' } },
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByTestId('returned-to-patient')).toHaveTextContent('/pacientes?paciente=pac-1&tab=lgpd|Ana');
  });

  it('keeps the registration page open if the database rejects the consent', async () => {
    mocks.single.mockResolvedValue({ data: null, error: new Error('RLS negou a gravação') });
    renderTask('/pacientes/pac-1/consentimentos/novo');

    await screen.findByRole('heading', { name: 'Novo consentimento' });
    await waitFor(() => expect(mocks.patientMaybeSingle).toHaveBeenCalled());
    await waitFor(() => expect(mocks.consentOrder).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('checkbox', { name: /Tratamento de Dados Pessoais/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Comunicações e Marketing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro' })));
    expect(screen.getByRole('heading', { name: 'Novo consentimento' })).toBeVisible();
    expect(screen.queryByTestId('returned-to-patient')).not.toBeInTheDocument();
  });

  it('keeps only the unsaved selection after a partial registration failure', async () => {
    mocks.single
      .mockResolvedValueOnce({ data: { id: 'consent-new' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Falha ao gravar o segundo consentimento') });
    renderTask('/pacientes/pac-1/consentimentos/novo');

    await screen.findByRole('checkbox', { name: /Tratamento de Dados Pessoais/ });
    const treatment = screen.getByRole('checkbox', { name: /Tratamento de Dados Pessoais/ });
    const sharing = screen.getByRole('checkbox', { name: /Compartilhamento com Convênio/ });
    fireEvent.click(treatment);
    fireEvent.click(sharing);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar Consentimento' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Registro parcial' })));
    expect(treatment).toHaveAttribute('aria-checked', 'false');
    expect(sharing).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByTestId('returned-to-patient')).not.toBeInTheDocument();
  });

  it('keeps the revocation page open if the database rejects the change', async () => {
    mocks.consentOrder.mockResolvedValue({ data: [consentimentoAceito], error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error('Falha de rede') });
    renderTask('/pacientes/pac-1/consentimentos/tratamento_dados/revogar');

    expect(await screen.findByRole('heading', { name: 'Revogar consentimento' })).toBeVisible();
    await waitFor(() => expect(mocks.patientMaybeSingle).toHaveBeenCalled());
    await waitFor(() => expect(mocks.consentOrder).toHaveBeenCalled());
    fireEvent.change(await screen.findByLabelText('Motivo da revogação'), { target: { value: 'Solicitação do paciente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Revogação' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro',
      description: 'Não foi possível revogar o consentimento.',
      variant: 'destructive',
    })));
    expect(screen.getByRole('heading', { name: 'Revogar consentimento' })).toBeVisible();
  });
});
