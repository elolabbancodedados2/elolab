import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GuiasLoteDialog } from '../GuiasLoteDialog';

const guia = { id: 'g1', numero_guia: 'G-1', numero_carteira: '1', paciente_id: null, autorizacao_id: null, data_atendimento: '2026-09-10', codigo_procedimento: '10101012', tipo_servico: 'consulta', quantidade: 1, valor_total: 10 };

describe('GuiasLoteDialog', () => {
  it('lista cada guia e campo a corrigir e remove guia de lote em rascunho por RPC', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    const onChanged = vi.fn();
    render(<GuiasLoteDialog
      lote={{ id: 'l1', numero_lote: '99', status: 'rascunho' }}
      guias={[guia]}
      autorizacoes={[]}
      pendencias={[{ guiaId: 'g1', numeroGuia: 'G-1', campo: 'codigo_procedimento', mensagem: 'Código do procedimento deve ter 8 dígitos (TUSS).', gravidade: 'erro', tipo: 'consistencia' }]}
      onOpenChange={vi.fn()}
      onChanged={onChanged}
    />);

    expect(screen.getByRole('region', { name: 'Validação do lote' })).toHaveTextContent('Guia G-1 · Código do procedimento: Código do procedimento deve ter 8 dígitos (TUSS).');
    expect(screen.getByText('1 a corrigir')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover guia G-1' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('remover_guia_lote_tiss', { p_guia_id: 'g1' });
  });

  it('não permite editar guias depois do envio', () => {
    render(<GuiasLoteDialog lote={{ id: 'l1', numero_lote: '99', status: 'enviado' }} guias={[guia]} autorizacoes={[]} pendencias={[]} onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('Lote consistente: nenhuma correção pendente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover guia/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Incluir guia/ })).not.toBeInTheDocument();
  });
});
