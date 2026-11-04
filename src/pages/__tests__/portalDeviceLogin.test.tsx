import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import PortalPaciente from '../PortalPaciente';

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/'); vi.clearAllMocks(); });
it('pede nascimento antes de buscar dados e reutiliza comprovante assinado', async () => {
  mocks.invoke.mockImplementation(async (_: string, { body }: any) => {
    if (body.action === 'verify_device') return { data: { device_proof: 'assinado-pelo-servidor' }, error: null };
    if (body.action === 'get_profile') return { data: body.device_proof ? { nome: 'Ana' } : { requires_birth_date: true }, error: null };
    return { data: [], error: null };
  });
  render(<MemoryRouter initialEntries={['/portal-paciente?token=antigo']}><PortalPaciente /></MemoryRouter>);
  const birth = await screen.findByLabelText('Data de nascimento');
  expect(mocks.invoke.mock.calls.some(call => call[1].body.action === 'get_agendamentos')).toBe(false);
  fireEvent.change(birth, { target: { value: '1990-01-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e acessar' }));
  await screen.findByRole('region', { name: 'Resumo do seu cuidado' });
  expect(localStorage.getItem('elolab_portal_aparelho_v1')).toBe('assinado-pelo-servidor');
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({ body: expect.objectContaining({ action: 'get_agendamentos', token: 'antigo', device_proof: 'assinado-pelo-servidor' }) })));
});
it('mostra bloqueio de 15 minutos sem exibir dados do paciente', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: 'bloqueado', context: new Response(JSON.stringify({ error: 'Acesso bloqueado por 15 minutos.', code: 'device_locked' }), { status: 429 }) } });
  render(<MemoryRouter initialEntries={['/portal-paciente?token=antigo']}><PortalPaciente /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('15 minutos');
  expect(screen.queryByRole('region', { name: 'Resumo do seu cuidado' })).not.toBeInTheDocument();
});

it('orienta abrir o link e mantém o código recolhido', async () => {
  render(<MemoryRouter><PortalPaciente /></MemoryRouter>);
  expect(screen.getByText('Abra o link que a clínica enviou pelo WhatsApp ou e-mail')).toBeVisible();
  expect(screen.queryByLabelText('Código de acesso do paciente')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tenho um código' }));
  expect(screen.getByLabelText('Código de acesso do paciente')).toBeVisible();
});
