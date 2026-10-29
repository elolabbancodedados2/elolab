import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

const auth = vi.hoisted(() => ({
  isPlatformAdmin: true,
  isClinicaOwner: false,
  isLoading: false,
  profile: { clinica_id: 'clinic-1' } as { clinica_id: string } | null,
  refreshProfile: vi.fn(),
}));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));

describe('ImpersonationBanner', () => {
  beforeEach(() => {
    auth.isPlatformAdmin = true;
    auth.isClinicaOwner = false;
    auth.isLoading = false;
    auth.profile = { clinica_id: 'clinic-1' };
  });
  afterEach(cleanup);

  it('não oferece encerrar suporte ao proprietário na própria clínica', () => {
    auth.isClinicaOwner = true;
    render(<ImpersonationBanner />);
    expect(screen.queryByRole('button', { name: 'Encerrar impersonação' })).not.toBeInTheDocument();
  });

  it('preserva a saída do acesso de suporte a outra clínica', () => {
    render(<ImpersonationBanner />);
    expect(screen.getByRole('button', { name: 'Encerrar impersonação' })).toBeInTheDocument();
  });

  it('aguarda a identificação do proprietário durante o carregamento', () => {
    auth.isLoading = true;
    render(<ImpersonationBanner />);
    expect(screen.queryByRole('button', { name: 'Encerrar impersonação' })).not.toBeInTheDocument();
  });

  it('não oferece acesso de suporte a um administrador apenas da clínica', () => {
    auth.isPlatformAdmin = false;
    render(<ImpersonationBanner />);
    expect(screen.queryByRole('button', { name: 'Encerrar impersonação' })).not.toBeInTheDocument();
  });
});
