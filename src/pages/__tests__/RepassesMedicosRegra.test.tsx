import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConfiguracaoMedico } from '../RepassesMedicos';
import { descreverRegraRepasse } from '@/lib/repasseWorkflow';

describe('regra de repasse médico', () => {
  it('descreve a regra de forma legível', () => {
    expect(descreverRegraRepasse('percentual', 30)).toBe('30% da receita');
    expect(descreverRegraRepasse('fixo', 50)).toMatch(/^R\$\s50,00 por atendimento$/);
  });

  it('pede confirmação mostrando antes e depois e só então grava com confirmação', async () => {
    rpc.mockResolvedValue({ data: { success: true, alterado: true }, error: null });
    const onSaved = vi.fn();
    render(<ConfiguracaoMedico
      medico={{ id: 'm1', nome: 'Dra. Ana', crm: '123', tipo_repasse: 'percentual', percentual_repasse: 30, valor_repasse_fixo: 0 }}
      ultimaAlteracao={{ alterado_por_nome: 'Bruno', alterado_em: '2026-10-20T13:00:00Z' }}
      onSaved={onSaved}
    />);
    expect(screen.getByText(/Última alteração por Bruno em 20\/10\/2026/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Percentual (%)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByText(/De 30% da receita para 40% da receita/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar alteração' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('configurar_repasse_medico', { p_medico_id: 'm1', p_tipo: 'percentual', p_valor: 40, p_confirmado: true });
  });

  it('migration exige confirmação e registra autor, data e valores', () => {
    const sql = readFileSync('supabase/migrations/20261024132000_regra_repasse_confirmada_e_auditada.sql', 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.repasse_regra_alteracoes/);
    expect(sql).toMatch(/IF p_confirmado IS NOT TRUE THEN/);
    expect(sql).toMatch(/INSERT INTO public\.repasse_regra_alteracoes[\s\S]*auth\.uid\(\)/);
    expect(sql).toMatch(/configurar_repasse_medico\(p_medico_id uuid, p_tipo text, p_valor numeric\)[\s\S]*?RAISE EXCEPTION 'Confirme/);
  });
});
