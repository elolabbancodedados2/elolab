import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EsperaIndicador } from './EsperaIndicador';

const AGORA = Date.parse('2026-10-24T13:00:00Z');
const haMinutos = (mins: number) => new Date(AGORA - mins * 60_000).toISOString();

describe('EsperaIndicador', () => {
  it('mostra atraso com texto visível e ícone próprio', () => {
    render(<EsperaIndicador desde={haMinutos(42)} agora={AGORA} />);
    const indicador = screen.getByLabelText('Espera de 42 min · Atrasado');
    expect(indicador).toHaveTextContent('42 min');
    expect(indicador).toHaveTextContent('Atrasado');
    expect(indicador.querySelector('svg')).toHaveAttribute('data-nivel', 'atrasado');
  });

  it('mostra espera longa por texto e mantém o rótulo acessível no prazo', () => {
    const { rerender } = render(<EsperaIndicador desde={haMinutos(20)} agora={AGORA} />);
    expect(screen.getByLabelText('Espera de 20 min · Espera longa')).toHaveTextContent('Espera longa');

    rerender(<EsperaIndicador desde={haMinutos(5)} agora={AGORA} />);
    expect(screen.getByLabelText('Espera de 5 min · No prazo')).toBeInTheDocument();
  });
});
