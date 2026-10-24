import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsoDoPlano } from '../UsoDoPlano';
import { mapearUsoPlano } from '@/lib/planUsage';

const refetch = vi.fn();
vi.mock('@/hooks/usePlanLimits', () => ({
  usePlanLimits: () => ({
    data: mapearUsoPlano({
      verificado_em: '2026-10-24T13:05:00Z',
      plano_nome: 'EloLab Pro',
      recursos: [
        { chave: 'funcionarios', rotulo: 'Funcionários ativos', usado: 9, limite: 10 },
        { chave: 'medicos', rotulo: 'Médicos ativos', usado: 3, limite: 3 },
      ],
    }),
    isLoading: false, isError: false, isFetching: false, error: null, refetch,
  }),
}));

describe('UsoDoPlano', () => {
  it('mostra uso, cota restante e quando o servidor contou', () => {
    render(<UsoDoPlano />);

    expect(screen.getByText('Funcionários ativos')).toBeInTheDocument();
    expect(screen.getByText('9 de 10 · restam 1')).toBeInTheDocument();
    expect(screen.getByText('3 de 3 · limite atingido')).toBeInTheDocument();
    expect(screen.getByText(/verificado pelo servidor em/i)).toHaveTextContent(new Date('2026-10-24T13:05:00Z').toLocaleString('pt-BR'));
    fireEvent.click(screen.getByRole('button', { name: /atualizar uso/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
