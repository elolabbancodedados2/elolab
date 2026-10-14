import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DoctorDashboardIdentityState, DoctorDashboardKpiLink } from '../DoctorDashboard';
import { MemoryRouter } from 'react-router-dom';

describe('estado de vínculo profissional no painel médico', () => {
  it('não renderiza bloqueio quando o médico está vinculado', () => {
    const { container } = render(
      <DoctorDashboardIdentityState medicoId="medico-1" onRetry={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('mostra carregamento enquanto busca o vínculo', () => {
    const { container } = render(
      <DoctorDashboardIdentityState isLoading medicoId={null} onRetry={vi.fn()} />,
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('explica como resolver a ausência de vínculo e permite tentar de novo', () => {
    const onRetry = vi.fn();
    const { container } = render(<DoctorDashboardIdentityState medicoId={null} onRetry={onRetry} />);

    expect(screen.getByRole('heading', { name: 'Cadastro profissional não vinculado' })).toBeInTheDocument();
    expect(screen.getByText(/Peça ao administrador da clínica para concluir o vínculo/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('border-border', 'bg-card');
    expect(screen.getByRole('heading', { name: 'Cadastro profissional não vinculado' })).toHaveClass('text-card-foreground');
    expect(container.querySelector('.text-primary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('mostra o erro de carregamento e permite repetir a consulta', () => {
    const onRetry = vi.fn();
    render(
      <DoctorDashboardIdentityState error={new Error('failed to fetch')} medicoId={null} onRetry={onRetry} />,
    );

    expect(screen.getByRole('heading', { name: 'Não foi possível carregar seu cadastro profissional' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('não transforma em link um cartão sem destino permitido', () => {
    render(
      <MemoryRouter>
        <DoctorDashboardKpiLink href={null}><span>Meus Pacientes</span></DoctorDashboardKpiLink>
      </MemoryRouter>,
    );

    expect(screen.getByText('Meus Pacientes').closest('a')).toBeNull();
  });
});
