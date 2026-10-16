import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'user-1' }, profile: { clinica_id: 'clinic-1' } }) }));
vi.mock('@/lib/auditTrail', () => ({ logAudit: vi.fn() }));
import { useAgendamentosPeriodo } from '@/hooks/useSupabaseData';

describe('appointment patient projection', () => {
  it.each([true, false])('preserves operational data with resumoPaciente=%s', async (resumoPaciente) => {
    const appointment = { id: 'appointment-1', pacientes: { nome: 'Paciente', convenio_id: 'coverage-1', alergias: ['Penicilina'] } };
    const query = {
      select: vi.fn((_campos: string) => query), filter: vi.fn(() => query), order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [appointment], error: null })),
    };
    mocks.from.mockReturnValue(query);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useAgendamentosPeriodo('2026-10-16', '2026-10-16', { resumoPaciente }), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toEqual([appointment]));
    const selection = query.select.mock.calls[0][0] as string;
    if (resumoPaciente) {
      const patientFields = selection.match(/pacientes\(([^)]+)\)/)?.[1].split(',').map(field => field.trim());
      expect(patientFields).toEqual(expect.arrayContaining(['id', 'nome', 'nome_social', 'cpf', 'telefone', 'email', 'data_nascimento', 'convenio_id', 'alergias', 'ativo']));
      expect(patientFields).not.toContain('*');
      expect(patientFields).not.toContain('observacoes');
      expect(patientFields).not.toContain('logradouro');
    } else {
      expect(selection).toContain('pacientes(*)');
    }
    expect(query.filter).toHaveBeenCalledWith('data', 'gte', '2026-10-16');
    expect(query.filter).toHaveBeenCalledWith('data', 'lte', '2026-10-16');
    hook.unmount();
    client.clear();
  });
});
