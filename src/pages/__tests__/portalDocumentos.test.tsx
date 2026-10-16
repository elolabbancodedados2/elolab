import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), falharDocumentos: false }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useSearchParams: () => [new URLSearchParams('token=token-teste')] };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

import PortalPaciente from '@/pages/PortalPaciente';

describe('documentos do portal do paciente', () => {
  beforeEach(() => {
    mocks.falharDocumentos = false;
    mocks.invoke.mockImplementation(async (_name: string, { body }: { body: { action: string } }) => {
      if (body.action === 'get_profile') return { data: { nome: 'Paciente Teste' }, error: null };
      if (body.action === 'get_documentos') {
        if (mocks.falharDocumentos) return { data: null, error: new Error('storage private path') };
        return { data: [{
          id: 'documento-1',
          nome: 'resultado.pdf',
          tipo: 'application/pdf',
          categoria: 'laudo',
          origem: 'externo',
          validade_ate: '2027-01-10',
          url: 'https://127.0.0.1:54321/storage/v1/object/sign/medical-attachments/prontuario/file.pdf?token=short',
          link_expira_em: '2026-10-14T15:05:00.000Z',
        }], error: null };
      }
      return { data: [], error: null };
    });
  });

  it('lista documento publicado com origem, validade e prazo do link privado', async () => {
    render(<PortalPaciente />);

    const user = userEvent.setup();
    const documentsTab = await screen.findByRole('tab', { name: /Documentos/i });
    await user.click(documentsTab);
    expect(documentsTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('patient-portal', expect.objectContaining({ body: expect.objectContaining({ action: 'get_documentos' }) })));

    expect(await screen.findByText('resultado.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Origem externa/)).toBeInTheDocument();
    expect(screen.getByText(/válido até 10\/01\/2027/i)).toBeInTheDocument();
    expect(screen.getByText(/link privado válido por cinco minutos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir resultado.pdf/i })).toBeEnabled();
  });

  it('não mostra documentos antigos quando a carga falha e mantém as demais abas utilizáveis', async () => {
    mocks.falharDocumentos = true;
    render(<PortalPaciente />);

    const user = userEvent.setup();
    const documentsTab = await screen.findByRole('tab', { name: /Documentos/i });
    await user.click(documentsTab);
    expect(documentsTab).toHaveAttribute('aria-selected', 'true');

    expect(await screen.findByText(/documentos estão indisponíveis temporariamente/i)).toBeInTheDocument();
    expect(screen.queryByText('resultado.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Algumas informações não puderam ser carregadas');
    await user.click(screen.getByRole('tab', { name: /Exames/i }));
    await waitFor(() => expect(screen.getByText('Nenhum exame encontrado')).toBeInTheDocument());
  });
});
