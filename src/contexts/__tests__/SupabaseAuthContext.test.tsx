import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Resultado = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  respostas: {} as Record<string, Resultado>,
  chamadas: [] as string[],
  authListener: null as null | ((event: string, session: unknown) => void),
  session: { access_token: 't', user: { id: 'u1', email: 'ana@example.test' } } as unknown,
  signOut: vi.fn(async () => ({ error: null })),
  limpar: vi.fn(async () => undefined),
}));

vi.mock('@/lib/limparDadosLocais', () => ({ limparDadosLocaisDoUsuario: mocks.limpar }));
vi.mock('@/lib/accountSessionDevice', () => ({ registerAccountSessionActivity: vi.fn(async () => true) }));
vi.mock('@/integrations/supabase/client', () => {
  const builderPara = (tabela: string) => {
    mocks.chamadas.push(tabela);
    const resultado = () => Promise.resolve(mocks.respostas[tabela] ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      update: () => builder,
      maybeSingle: resultado,
      then: (ok: (v: Resultado) => unknown, err?: (e: unknown) => unknown) => resultado().then(ok, err),
    });
    return builder;
  };
  return {
    supabase: {
      from: (tabela: string) => builderPara(tabela),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: {
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          mocks.authListener = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
        getSession: vi.fn(async () => ({ data: { session: mocks.session } })),
        signOut: mocks.signOut,
      },
    },
  };
});

import { SupabaseAuthProvider, useSupabaseAuth } from '../SupabaseAuthContext';
import { ordenarPapeis } from '@/lib/papeis';

function Sonda() {
  const auth = useSupabaseAuth();
  return (
    <div>
      <p>carregando:{String(auth.isLoading)}</p>
      <p>papel:{auth.profile?.role ?? 'nenhum'}</p>
      <p>papeis:{auth.profile?.roles.join(',') ?? ''}</p>
      <p>erro:{auth.profileError?.message ?? 'nenhum'}</p>
      <p>plataforma:{String(auth.isPlatformAdmin)}</p>
      <p>dono:{String(auth.isClinicaOwner)}</p>
      <button onClick={() => void auth.signOut({ scope: 'local' })}>sair local</button>
    </div>
  );
}

function renderProvider() {
  const client = new QueryClient();
  const clear = vi.spyOn(client, 'clear');
  render(<QueryClientProvider client={client}><SupabaseAuthProvider><Sonda /></SupabaseAuthProvider></QueryClientProvider>);
  return { clear };
}

describe('SupabaseAuthContext', () => {
  beforeEach(() => {
    mocks.chamadas.length = 0;
    mocks.signOut.mockClear();
    mocks.limpar.mockClear();
    mocks.respostas = {
      profiles: { data: { id: 'u1', nome: 'Ana', email: 'ana@example.test', ativo: true, clinica_id: 'c1' }, error: null },
      user_roles: { data: [{ role: 'recepcao' }, { role: 'medico' }], error: null },
      platform_admins: { data: null, error: null },
      clinicas: { data: { owner_id: 'u1' }, error: null },
    };
  });

  it('ordena os papéis de forma explícita', () => {
    expect(ordenarPapeis(['financeiro', 'recepcao', 'admin', 'medico', 'enfermagem', 'outro', 'medico'])).toEqual(['admin', 'medico', 'enfermagem', 'recepcao', 'financeiro']);
  });

  it('carrega perfil, papéis e plataforma sem consultar platform_admins duas vezes', async () => {
    renderProvider();
    expect(await screen.findByText('papel:medico')).toBeInTheDocument();
    expect(screen.getByText('carregando:false')).toBeInTheDocument();
    expect(screen.getByText('papeis:medico,recepcao')).toBeInTheDocument();
    expect(screen.getByText('dono:true')).toBeInTheDocument();
    expect(mocks.chamadas.filter(t => t === 'platform_admins')).toHaveLength(1);
  });

  it('falha de rede ao ler os papéis vira profileError, não conta sem papel', async () => {
    mocks.respostas.user_roles = { data: null, error: { message: 'Failed to fetch' } };
    renderProvider();
    expect(await screen.findByText('erro:Failed to fetch')).toBeInTheDocument();
    expect(screen.getByText('papel:nenhum')).toBeInTheDocument();
  });

  it('signOut local limpa dados do navegador e o cache', async () => {
    const { clear } = renderProvider();
    await screen.findByText('papel:medico');
    await act(async () => { screen.getByRole('button', { name: 'sair local' }).click(); });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.limpar).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });

  it('SIGNED_OUT vindo de fora também limpa os dados locais', async () => {
    const { clear } = renderProvider();
    await screen.findByText('papel:medico');
    await act(async () => { mocks.authListener?.('SIGNED_OUT', null); });
    await waitFor(() => expect(mocks.limpar).toHaveBeenCalled());
    expect(clear).toHaveBeenCalled();
  });
});
