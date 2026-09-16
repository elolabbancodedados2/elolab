import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NewDirectBillingForm } from '@/pages/Pagamentos';

const { insert, success, errorToast } = vi.hoisted(() => ({ insert: vi.fn(), success: vi.fn(), errorToast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ insert }) } }));
vi.mock('sonner', () => ({ toast: { success, error: errorToast } }));
vi.mock('@/lib/pdfReceipt', () => ({ printReceiptPdf: vi.fn(), downloadReceiptPdf: vi.fn() }));

beforeEach(() => { cleanup(); vi.clearAllMocks(); });

function preencher() {
  const onSuccess = vi.fn();
  render(<Dialog open><DialogContent><NewDirectBillingForm pacientes={[]} onSuccess={onSuccess} onCancel={vi.fn()} /></DialogContent></Dialog>);
  fireEvent.change(screen.getByPlaceholderText('Ex: Consulta médica, Procedimento...'), { target: { value: 'Consulta' } });
  fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '100' } });
  fireEvent.change(screen.getAllByRole('spinbutton')[3], { target: { value: '3' } });
  return onSuccess;
}

describe('salvamento da cobrança direta', () => {
  it.each([false, true])('envia todas as parcelas em um único insert (já pago: %s)', async (pago) => {
    insert.mockResolvedValue({ error: null });
    const onSuccess = preencher();
    if (pago) fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/33,34/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Cobrança' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0].map((p: { valor: number }) => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(insert.mock.calls[0][0].map((p: { valor_pago: number | null }) => p.valor_pago)).toEqual(pago ? [33.34, 33.33, 33.33] : [null, null, null]);
  });
  it('não envia parcelas com quantidade fracionária', async () => {
    preencher();
    fireEvent.change(screen.getAllByRole('spinbutton')[3], { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Cobrança' }));
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
    expect(insert).not.toHaveBeenCalled();
  });
  it('mantém o formulário aberto e não confirma sucesso quando o insert falha', async () => {
    insert.mockResolvedValue({ error: { message: 'Falha de teste' } });
    const onSuccess = preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Cobrança' }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Falha de teste'));
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0]).toHaveLength(3);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar Cobrança' })).toBeEnabled();
  });
});
