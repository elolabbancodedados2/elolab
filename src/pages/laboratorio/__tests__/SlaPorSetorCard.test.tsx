import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SlaPorSetorCard } from '@/pages/laboratorio/SlaPorSetorCard';

describe('SlaPorSetorCard', () => {
  it('mostra medianas por etapa, limite do setor e amostras em atraso', () => {
    render(<SlaPorSetorCard linhas={[
      { setor_id: 's1', setor_nome: 'Hematologia', sla_horas: 12, amostras: 8, espera_coleta_h: 0.5, coleta_recebimento_h: null, recebimento_processamento_h: 2.25, processamento_liberacao_h: 6, total_h: 9.1, em_atraso: 2 },
      { setor_id: null, setor_nome: 'Sem setor', sla_horas: 24, amostras: 1, espera_coleta_h: null, coleta_recebimento_h: null, recebimento_processamento_h: null, processamento_liberacao_h: null, total_h: null, em_atraso: 0 },
    ]} />);

    const hemato = screen.getByRole('row', { name: /Hematologia/ });
    expect(within(hemato).getByText('12 h')).toBeInTheDocument();
    expect(within(hemato).getByText('2,3 h')).toBeInTheDocument();
    expect(within(hemato).getByText('2 em atraso')).toBeInTheDocument();
    const semSetor = screen.getByRole('row', { name: /Sem setor/ });
    expect(within(semSetor).getAllByText('—').length).toBeGreaterThanOrEqual(5);
    expect(within(semSetor).getByText('Em dia')).toBeInTheDocument();
  });

  it('explica quando não há amostras no período', () => {
    render(<SlaPorSetorCard linhas={[]} />);
    expect(screen.getByText(/Sem amostras neste período/)).toBeInTheDocument();
  });
});
