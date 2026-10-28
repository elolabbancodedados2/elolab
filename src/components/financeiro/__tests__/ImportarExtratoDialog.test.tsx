import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const consulta = vi.hoisted(() => {
  const q: any = {};
  for (const m of ['select', 'eq', 'order']) q[m] = vi.fn(() => q);
  q.range = vi.fn(() => Promise.resolve({ data: [{ fitid: 'A2' }], error: null }));
  return q;
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: vi.fn(() => consulta) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ImportarExtratoDialog } from '../ImportarExtratoDialog';

const OFX = '<OFX><BANKID>1<ACCTID>9<STMTTRN><DTPOSTED>20261002<TRNAMT>150.00<FITID>A1<MEMO>PIX</STMTTRN><STMTTRN><DTPOSTED>20261003<TRNAMT>-20<FITID>A2<MEMO>TARIFA</STMTTRN><STMTTRN><DTPOSTED>20261002<TRNAMT>150.00<FITID>A1<MEMO>PIX</STMTTRN></OFX>';

describe('ImportarExtratoDialog', () => {
  it('mostra a prévia e registra somente as transações novas, sem criar lançamentos', async () => {
    rpc.mockResolvedValue({ data: { success: true, importadas: 1, repetidas: 0 }, error: null });
    render(<ImportarExtratoDialog clinicaId="c1" lancamentos={[{ id: 'l1', tipo: 'receita', descricao: 'Consulta', valor: 150, valor_pago: 150, status: 'pago', data: '2026-10-01', data_pagamento: '2026-10-01', data_vencimento: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Importar extrato/ }));
    const arquivo = new File([OFX], 'extrato.ofx', { type: 'application/x-ofx' });
    // jsdom não implementa Blob.text().
    Object.defineProperty(arquivo, 'text', { value: () => Promise.resolve(OFX) });
    fireEvent.change(screen.getByLabelText('Arquivo OFX'), { target: { files: [arquivo] } });

    expect(await screen.findByRole('status')).toHaveTextContent('3 transação(ões): 1 nova(s), 1 já importada(s), 1 repetida(s) no arquivo · 2 com correspondência');
    fireEvent.click(screen.getByRole('button', { name: /Registrar 1 transação/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(rpc).toHaveBeenCalledWith('importar_extrato_bancario', { p_conta: '1-9', p_transacoes: [{ fitid: 'A1', data: '2026-10-02', valor: 150, descricao: 'PIX' }] });
  });
});
