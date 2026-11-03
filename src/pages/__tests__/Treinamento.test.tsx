import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tutorials } from '@/lib/treinamentoTutoriais';
import Treinamento from '../Treinamento';

const mocks = vi.hoisted(() => ({
  roles: ['admin'] as string[],
  progressError: null as Error | null,
}));

vi.mock('@/contexts/SupabaseAuthContext', () => ({
  useSupabaseAuth: () => ({
    user: { id: 'user-1' },
    profile: { clinica_id: 'clinic-1', roles: mocks.roles },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        upsert: async () => ({ error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: mocks.progressError ? null : [], error: mocks.progressError }).then(resolve, reject),
      };
      return query;
    },
  },
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}{location.search}</output>;
}

function renderTreinamento(path = '/treinamento') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}><QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/treinamento" element={<Treinamento />} />
        <Route path="/treinamento/:tutorialKey" element={<Treinamento />} />
      </Routes>
      <CurrentPath />
    </QueryClientProvider></MemoryRouter>,
  );
}

describe('Treinamento', () => {
  beforeEach(() => {
    mocks.roles = ['admin'];
    mocks.progressError = null;
  });

  it('mantém os roteiros disponíveis quando o histórico de progresso falha', async () => {
    mocks.progressError = new Error('offline');
    renderTreinamento();

    expect(await screen.findByText(/os roteiros continuam disponíveis/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fluxo clínico responsável' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /começar tutorial/i }).length).toBeGreaterThan(0);
  });

  it('oculta a etapa de documentos para enfermagem, cuja rota não permite acesso', async () => {
    mocks.roles = ['enfermagem'];
    renderTreinamento();

    const tutorial = await screen.findByRole('heading', { name: 'Fluxo clínico responsável' });
    fireEvent.click(screen.getAllByRole('button', { name: /começar tutorial/i })[1]);
    expect(screen.getByTestId('current-path')).toHaveTextContent('/treinamento/fluxo-clinico');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Confirme a pessoa atendida' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/treinamento/fluxo-clinico?etapa=1');

    expect(await screen.findByRole('heading', { name: 'Finalize sua etapa' })).toBeInTheDocument();
    expect(screen.queryByText('Revise documentos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /abrir documentos/i })).not.toBeInTheDocument();
  });

  it('retoma a etapa indicada no endereço e não abre roteiro restrito ao perfil', async () => {
    mocks.roles = ['enfermagem'];
    const current = renderTreinamento('/treinamento/fluxo-clinico?etapa=1');

    expect(await screen.findByRole('heading', { name: 'Finalize sua etapa' })).toBeVisible();
    expect(screen.getByText('Etapa 2 de 2')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    current.unmount();
    renderTreinamento('/treinamento/financeiro-seguro');
    expect(await screen.findByRole('heading', { name: 'Tutorial não disponível' })).toBeVisible();
  });
});

const ALL_ROLES = ['admin', 'medico', 'recepcao', 'enfermagem', 'financeiro'];

function loadAppRoutes() {
  const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  return [...source.matchAll(/<Route path="([^"]+)"([^\r\n]*)/g)].map(([, path, rest]) => {
    const allowed = rest.match(/allowedRoles=\{\[([^\]]*)\]\}/);
    return { path, roles: allowed ? [...allowed[1].matchAll(/'(\w+)'/g)].map(match => match[1]) : null };
  });
}

function findRoute(routes: ReturnType<typeof loadAppRoutes>, pathname: string) {
  const exact = routes.find(route => route.path === pathname);
  if (exact) return exact;
  return routes.find(route => {
    if (route.path === '*') return false;
    const pattern = route.path.replace(/:[^/]+/g, '[^/]+').replace(/\/\*$/, '(/.*)?');
    return new RegExp(`^${pattern}$`).test(pathname);
  });
}

describe('roteiros de treinamento', () => {
  const routes = loadAppRoutes();

  it('todo atalho aponta para uma rota real e liberada para os perfis do roteiro', () => {
    const problems: string[] = [];
    for (const tutorial of tutorials) {
      for (const step of tutorial.steps) {
        if (!step.href) continue;
        const route = findRoute(routes, step.href.split('?')[0]);
        if (!route) { problems.push(`${tutorial.key}: rota inexistente ${step.href}`); continue; }
        const viewers = step.roles ?? tutorial.roles;
        for (const role of viewers) {
          if (!tutorial.roles.includes(role as never)) problems.push(`${tutorial.key}: etapa "${step.title}" cita perfil fora do roteiro (${role})`);
          if (route.roles && !route.roles.includes(role)) problems.push(`${tutorial.key}: ${role} não acessa ${step.href}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('cada perfil tem ao menos um roteiro e as chaves são únicas', () => {
    for (const role of ALL_ROLES) {
      expect(tutorials.some(tutorial => tutorial.roles.includes(role as never)), role).toBe(true);
    }
    const keys = tutorials.map(tutorial => tutorial.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('toda etapa com atalho tem texto do botão e todo roteiro tem etapas', () => {
    for (const tutorial of tutorials) {
      expect(tutorial.steps.length, tutorial.key).toBeGreaterThan(0);
      for (const step of tutorial.steps) {
        if (step.href) expect(step.action, `${tutorial.key}/${step.title}`).toBeTruthy();
      }
    }
  });

  it('inclui as rotinas principais de cada área', () => {
    const keys = tutorials.map(tutorial => tutorial.key);
    expect(keys).toEqual(expect.arrayContaining([
      'caixa-diario', 'prontuario-prescricao', 'estoque-rotina', 'portal-paciente-recepcao', 'configuracao-inicial', 'triagem-sinais-vitais',
    ]));
  });
});
