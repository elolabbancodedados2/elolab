import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FaixaSinaisVitais } from '../FaixaSinaisVitais';

describe('FaixaSinaisVitais', () => {
  it('convida a registrar quando não há sinais e abre o exame físico', () => {
    const onAbrir = vi.fn();
    render(<FaixaSinaisVitais sinais={{ pressao_sistolica: '', temperatura: '' }} onAbrir={onAbrir} />);

    fireEvent.click(screen.getByRole('button', { name: /Sinais vitais não registrados/ }));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it('mostra os valores e destaca só o que está fora da faixa', () => {
    render(
      <FaixaSinaisVitais
        sinais={{ pressao_sistolica: '165', pressao_diastolica: '100', frequencia_cardiaca: '72', temperatura: '36.5', saturacao: '98', peso: '70' }}
        onAbrir={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Sinais vitais: PA 165/100 mmHg, FC 72 bpm, Temp 36,5 °C, SpO₂ 98 %, Peso 70 kg. Abrir exame físico' })).toBeInTheDocument();
    expect(screen.getByText('165/100')).toHaveClass('text-destructive');
    expect(screen.getByText('72')).toHaveClass('text-foreground');
  });

  it('mostra a triagem como origem e copia para o prontuário', () => {
    const onUsar = vi.fn();
    render(
      <FaixaSinaisVitais
        sinais={{ pressao_sistolica: '120', pressao_diastolica: '80', saturacao: '97' }}
        onAbrir={() => undefined}
        origem="Triagem 09:40"
        onUsar={onUsar}
      />,
    );

    expect(screen.getByRole('button', { name: 'Triagem 09:40: PA 120/80 mmHg, SpO₂ 97 %. Abrir exame físico' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Usar no prontuário' }));
    expect(onUsar).toHaveBeenCalledTimes(1);
  });

  it('não oferece copiar quando a triagem não tem valores', () => {
    render(<FaixaSinaisVitais sinais={{}} onAbrir={() => undefined} origem="Triagem 09:40" onUsar={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Usar no prontuário' })).not.toBeInTheDocument();
  });
});
