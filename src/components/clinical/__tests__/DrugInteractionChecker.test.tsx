import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrugInteractionChecker } from '../DrugInteractionChecker';

describe('DrugInteractionChecker', () => {
  it('abre a revisão em uma página de contexto sem modal', () => {
    const onOpenReview = vi.fn();
    render(<DrugInteractionChecker medicamentos={['varfarina', 'aas']} alergias={[]} onOpenReview={onOpenReview} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver todos os 1 alertas de medicamentos' }));

    expect(onOpenReview).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mostra os alertas e a limita??o das regras na tela pr?pria', () => {
    render(
      <DrugInteractionChecker
        fullPage
        patientName="Pessoa Exemplo"
        medicamentos={['varfarina', 'aas']}
        alergias={[]}
        onCloseReview={vi.fn()}
      />,
    );

    expect(screen.getByTestId('drug-interaction-review-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Alertas de medicamentos' })).toBeInTheDocument();
    expect(screen.getByText(/As regras locais/)).toBeInTheDocument();
    expect(screen.getByText('Risco aumentado de sangramento')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('n?o apresenta uma prescri??o sem alertas como comprova??o de aus?ncia de risco', () => {
    render(<DrugInteractionChecker fullPage medicamentos={['medicamento sem regra local']} alergias={[]} />);

    expect(screen.getByRole('heading', { name: 'Nenhum alerta encontrado pelas regras locais' })).toBeInTheDocument();
    expect(screen.getByText(/confirma ausência de risco/i)).toBeInTheDocument();
  });


  it('explica quando a tela abre sem medicamentos carregados', () => {
    render(<DrugInteractionChecker fullPage medicamentos={[]} alergias={[]} />);

    expect(screen.getByRole('heading', { name: /medicamentos carregados/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Nenhum alerta encontrado/ })).not.toBeInTheDocument();
  });

  it('não confunde falha no carregamento com lista vazia e permite tentar novamente', () => {
    const onRetry = vi.fn();
    render(<DrugInteractionChecker fullPage medicamentos={[]} alergias={[]} loadError={new Error('offline')} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/carregar as prescri/);
    expect(screen.queryByText(/medicamentos carregados/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
