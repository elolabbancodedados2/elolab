import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ data: [] as any[] }));
const download = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: estado.data, isLoading: false, refetch: vi.fn(), isError: false }) }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('@/lib/auditExport', () => ({ downloadStringAsFile: download }));
vi.mock('@/lib/dateOnly', async (original) => ({ ...(await original<any>()), todaySaoPauloDateOnly: () => '2026-10-24' }));

import CobrancaInadimplentes from '../CobrancaInadimplentes';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/inadimplentes']}>
      <Routes>
        <Route path="/inadimplentes" element={<CobrancaInadimplentes />} />
        <Route path="/contas" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { estado.data = []; download.mockReset(); });

describe('CobrancaInadimplentes', () => {
  it('oferece consultar contas a receber sem iniciar uma cobrança', () => {
    renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'Cobrança de inadimplentes' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma pendência vencida')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir contas a receber' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/contas?tab=receber');
  });

  it('filtra por faixa de atraso e exporta somente a lista filtrada após confirmação', () => {
    estado.data = [
      { id: 'a', descricao: 'Consulta', valor: 100, valor_pago: 0, desconto: 0, acrescimo: 0, status: 'pendente', data_vencimento: '2026-10-14', pacientes: { nome: 'Ana', telefone: '11999990000' } },
      { id: 'b', descricao: 'Exame', valor: 300, valor_pago: 0, desconto: 0, acrescimo: 0, status: 'atrasado', data_vencimento: '2026-06-01', pacientes: { nome: 'Bruno', email: 'b@x.com' } },
    ];
    renderizar();

    const faixa90 = screen.getByRole('button', { name: /Mais de 90 dias · 1/ });
    fireEvent.click(faixa90);
    expect(faixa90).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Exportar lista/ }));
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(download).toHaveBeenCalledTimes(1);
    const { content, filename } = download.mock.calls[0][0];
    expect(filename).toBe('cobranca-manual-2026-10-24.csv');
    expect(content).toContain('"Bruno"');
    expect(content).not.toContain('"Ana"');
    expect(content).toContain('"Mais de 90 dias"');
  });

  it('agrupa os títulos vencidos por paciente com o total devido', () => {
    estado.data = [
      { id: 'a', paciente_id: 'p1', descricao: 'Consulta', valor: 100, valor_pago: 0, desconto: 0, acrescimo: 0, status: 'pendente', data_vencimento: '2026-10-14', pacientes: { nome: 'Ana', telefone: '11999990000' } },
      { id: 'b', paciente_id: 'p1', descricao: 'Exame', valor: 250, valor_pago: 50, desconto: 0, acrescimo: 0, status: 'parcial', data_vencimento: '2026-09-01', pacientes: { nome: 'Ana', telefone: '11999990000' } },
      { id: 'c', paciente_id: 'p2', descricao: 'Exame', valor: 80, valor_pago: 0, desconto: 0, acrescimo: 0, status: 'atrasado', data_vencimento: '2026-10-01', pacientes: { nome: 'Bruno' } },
    ];
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Por paciente · 2/ }));
    const linhaAna = screen.getByRole('row', { name: /Ana/ });
    expect(linhaAna).toHaveTextContent('2');
    expect(linhaAna).toHaveTextContent(/R\$\s300,00/);
    expect(linhaAna).toHaveTextContent('53 dias');
    expect(screen.getByRole('link', { name: 'Contatar Ana via WhatsApp' })).toBeInTheDocument();
  });
});
