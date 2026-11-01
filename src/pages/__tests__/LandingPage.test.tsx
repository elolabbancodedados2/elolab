import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from '../LandingPage';

const { planData } = vi.hoisted(() => ({ planData: { current: [] as Array<Record<string, unknown>>, error: false } }));
vi.mock('@/hooks/useSubscriptionPlan', () => ({
  usePlanos: () => ({ data: planData.current, isLoading: false, isError: planData.error }),
}));

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

beforeEach(() => { planData.current = []; planData.error = false; });

describe('navegação mobile da landing', () => {
  it('expõe o estado do menu e fecha depois de escolher uma seção', () => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'navegacao-mobile');

    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Fechar menu de navegação' })).toHaveAttribute('aria-expanded', 'true');
    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegação móvel' });
    expect(mobileNavigation).toHaveAttribute('id', 'navegacao-mobile');

    fireEvent.click(within(mobileNavigation).getByRole('link', { name: 'Recursos' }));
    expect(document.getElementById('navegacao-mobile')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menu de navegação' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('hero institucional', () => {
  it('usa uma imagem de ambiente clínico sem expor dados demonstrativos fictícios', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: /painel de gestão da EloLab/i })).toBeInTheDocument();
    expect(screen.queryByText('R$ 29.9k')).not.toBeInTheDocument();
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
  });
});

describe('condições dos planos', () => {
  it('não anuncia teste grátis quando o plano tem zero dias', () => {
    planData.current = [{ slug: 'elolab-max', nome: 'EloLab Max', valor: 99, destaque: true, frequencia: 'mensal', trial_dias: 0, features: [], ativo: true }];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    expect(screen.queryByRole('button', { name: /testar.*dias grátis/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assinar agora/i })).toBeInTheDocument();
  });

  it('exibe a duração de teste configurada no catálogo do plano', () => {
    planData.current = [{ slug: 'elolab-max', nome: 'EloLab Max', valor: 99, destaque: true, frequencia: 'mensal', trial_dias: 5, features: [], ativo: true }];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /testar grátis por 5 dias/i })).toBeInTheDocument();
    expect(screen.getByText(/teste grátis por 5 dias nos planos elegíveis/i)).toBeInTheDocument();
  });

  it('mostra a frequência trimestral do catálogo sem exibir o identificador interno', () => {
    planData.current = [{ slug: 'elolab-max', nome: 'EloLab Pro', valor: 379, destaque: true, frequencia: 'trimestral', trial_dias: 0, features: [], ativo: true }];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    expect(screen.getByText('/3 meses')).toBeInTheDocument();
    expect(screen.queryByText('/trimestral')).not.toBeInTheDocument();
  });

  it('diferencia catálogo vazio de falha ao carregar os planos', () => {
    const { rerender } = render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByText(/não há planos disponíveis para contratação/i)).toBeInTheDocument();

    planData.error = true;
    rerender(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByText(/não foi possível carregar os planos agora/i)).toBeInTheDocument();
  });

  it('explica a data da primeira cobrança sem assumir frequência mensal', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /como funciona o teste grátis/i }));

    expect(screen.getByText(/primeira cobrança recorrente/i)).toBeInTheDocument();
    expect(screen.queryByText(/primeira mensalidade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^LGPD$/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /política de privacidade/i }).length).toBeGreaterThan(0);
  });
});

describe('jornada comercial da landing', () => {
  it('rola até a seção de planos ao abrir a landing com o hash #planos', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<MemoryRouter initialEntries={['/#planos']}><LandingPage /></MemoryRouter>);

    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' }));
  });

  it('descreve os limites e capacidades verificáveis dos fluxos clínicos', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);


    fireEvent.click(screen.getByRole('button', { name: 'O EloLab atende laboratórios também?' }));
    expect(screen.getByText(/nos planos que incluem exames/i)).toBeInTheDocument();
    expect(screen.getByText(/código único e histórico de movimentações/i)).toBeInTheDocument();
    expect(screen.getByText(/lotes TISS são transmitidos à operadora por um canal externo/i)).toBeInTheDocument();
  });

  it('informa o escopo atual da importação de dados', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Consigo trazer os dados do meu sistema atual?' }));
    expect(screen.getByText(/importar pacientes e agendamentos por planilha em Configurações/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmar formato, escopo, prazo e custo/i)).toBeInTheDocument();
  });

  it('destaca o diferencial do Ultra sem repetir os recursos compartilhados do Pro', () => {
    planData.current = [
      { slug: 'elolab-max', nome: 'EloLab Pro', valor: 379, destaque: false, frequencia: 'mensal', trial_dias: 0, features: ['agenda', 'pacientes', 'prontuarios'], ativo: true },
      { slug: 'elolab-ultra', nome: 'EloLab Ultra', valor: 499, destaque: true, frequencia: 'mensal', trial_dias: 3, features: ['agenda', 'pacientes', 'prontuarios', 'agente_ia'], ativo: true },
    ];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    const ultra = screen.getByRole('heading', { name: 'EloLab Ultra' }).closest('div.relative.rounded-3xl');
    const pro = screen.getByRole('heading', { name: 'EloLab Pro' }).closest('div.relative.rounded-3xl');
    expect(ultra).not.toBeNull();
    expect(pro).not.toBeNull();
    expect(within(ultra as HTMLElement).getByText(/inclui os recursos do elolab pro e o agente de ia no whatsapp/i)).toBeInTheDocument();
    expect(within(ultra as HTMLElement).getByText('Agente de IA no WhatsApp')).toBeInTheDocument();
    expect(within(ultra as HTMLElement).queryByText('Agenda', { exact: true })).not.toBeInTheDocument();
    expect(within(pro as HTMLElement).getByText('Agenda', { exact: true })).toBeInTheDocument();
  });

  it('oferece a demonstração fictícia diretamente no hero', () => {
    render(<MemoryRouter><LandingPage /><CurrentPath /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Ver demonstração com dados fictícios' }));

    expect(screen.getByTestId('current-path')).toHaveTextContent('/demonstracao');
  });

  it('explica a renovação do cartão e o período do Pix antes de criar a conta e oferece a demonstração', () => {
    planData.current = [{ slug: 'elolab-max', nome: 'EloLab Max', valor: 99, destaque: true, frequencia: 'mensal', trial_dias: 0, features: [], ativo: true }];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    const demoLink = screen.getByRole('link', { name: /ver demonstração da clínica/i });
    expect(demoLink).toHaveAttribute('href', '/demonstracao');
    expect(screen.getByText('Cartão recorrente · Pix por período')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /assinar agora/i }));
    expect(screen.getByText(/no cartão, começa uma assinatura com renovação automática/i)).toBeInTheDocument();
    expect(screen.getByText(/no pix, você compra o período exibido para este plano, sem renovação automática/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar conta e continuar/i })).toBeInTheDocument();
  });

  it('modal de compra informa que a escolha de pagamento acontece no checkout e devolve foco ao fechar', async () => {
    planData.current = [{ slug: 'elolab-max', nome: 'EloLab Pro', valor: 379, destaque: false, frequencia: 'mensal', trial_dias: 0, features: [], ativo: true }];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    const trigger = screen.getByRole('button', { name: /assinar agora/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/crie sua conta para chegar ao checkout/i);
    expect(dialog).toHaveTextContent(/checkout.*escolher/i);
    expect(dialog).not.toHaveTextContent(/antes de criar sua conta, escolha como pagar/i);
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('explica cartão obrigatório, R$ 0 pelo EloLab e cobrança após o teste', () => {
    planData.current = [{ slug: 'elolab-max', nome: 'EloLab Max', valor: 99, destaque: true, frequencia: 'mensal', trial_dias: 5, features: [], ativo: true }];
    render(<MemoryRouter><LandingPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: /testar 5 dias grátis/i }));
    expect(screen.getByRole('list', { name: 'Etapas para iniciar o teste' })).toHaveTextContent(/3\.\s*Cadastre um cartão no EloLab para iniciar o teste/i);
    expect(screen.getByText(/hoje você não paga pelo elolab/i)).toBeInTheDocument();
    expect(screen.getByText(/cobrança recorrente de R\$\s*99,00\/mês/i)).toBeInTheDocument();
    expect(screen.getByText(/o acesso ao plano termina ao cancelar/i)).toBeInTheDocument();
    expect(screen.getByText(/o cartão fica salvo para a assinatura recorrente após o teste/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar conta e seguir para o cartão/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /liberar meu acesso grátis/i })).not.toBeInTheDocument();
  });
});
