import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, storage: { from: vi.fn() } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecursoGlosaDialog, ResumoRecurso } from '../RecursoGlosaDialog';

const glosa = { id: 'g1', status: 'recurso_preparacao', codigo_glosa: '1801', valor_glosado: 50, recurso_justificativa: 'Procedimento autorizado previamente', recurso_prazo: '2026-11-01', recurso_responsavel_id: 'u1' };

describe('RecursoGlosaDialog', () => {
  it('salva justificativa e depois prazo e responsável pelo banco', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    const salvarJustificativa = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<RecursoGlosaDialog glosa={glosa} clinicaId="c1" responsaveis={[{ id: 'u1', nome: 'Ana' }]} documentos={[{ id: 'd1', glosa_id: 'g1', storage_path: 'c1/g1/x.pdf', file_name: 'laudo.pdf', created_at: '' }]} salvarJustificativa={salvarJustificativa} onClose={onClose} onChanged={vi.fn()} />);

    expect(screen.getByRole('button', { name: /laudo\.pdf/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar recurso' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(salvarJustificativa).toHaveBeenCalledWith('g1', 'Procedimento autorizado previamente');
    expect(rpc).toHaveBeenCalledWith('definir_recurso_glosa', { p_glosa_id: 'g1', p_prazo: '2026-11-01', p_responsavel_id: 'u1' });
  });

  it('não permite salvar sem prazo', () => {
    render(<RecursoGlosaDialog glosa={{ ...glosa, recurso_prazo: null }} clinicaId="c1" responsaveis={[]} documentos={[]} salvarJustificativa={vi.fn()} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Salvar recurso' })).toBeDisabled();
  });

  it('resume prazo vencido, responsável e anexos na linha', () => {
    render(<ResumoRecurso glosa={{ status: 'recurso_preparacao', recurso_prazo: '2020-01-01' }} responsavel="Ana" documentos={2} />);
    expect(screen.getByText(/Prazo 01\/01\/2020/)).toHaveTextContent('Prazo 01/01/2020(Prazo vencido) · Responsável: Ana · 2 documento(s)');
  });
});
