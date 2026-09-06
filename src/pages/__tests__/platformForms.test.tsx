import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import PlatformConsumo from '@/pages/PlatformConsumo';
import PlatformComunicacao from '@/pages/PlatformComunicacao';

const { rpc, insert } = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({ insert }) } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'test' } }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'platform-usage' ? [{
    clinica_id: 'test', clinica_nome: 'Clínica teste', max_users: 10, users_used: 1,
    max_ai_tokens: 5000, ai_tokens_used: 0, max_notifications: 100, notifications_used: 0,
  }] : [] }),
}));

beforeEach(() => { cleanup(); vi.restoreAllMocks(); rpc.mockReset(); insert.mockReset(); });
describe('Formulários da plataforma', () => {
  it.each([0, 1, 2])('cancelar o campo %i não grava limites', (index) => {
    const responses = ['10', '5000', '100'];
    vi.spyOn(window, 'prompt').mockImplementation(() => responses.length === 3 - index ? null : responses.shift()!);
    render(<PlatformConsumo />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar limites' }));
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejeita limites vazios', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');
    render(<PlatformConsumo />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar limites' }));
    expect(rpc).not.toHaveBeenCalled();
  });
  it('bloqueia comunicado que termina antes de começar', () => {
    const { container } = render(<PlatformComunicacao />);
    fireEvent.change(screen.getByPlaceholderText('Título'), { target: { value: 'Aviso' } });
    fireEvent.change(screen.getByPlaceholderText('Mensagem'), { target: { value: 'Mensagem teste' } });
    const fields = container.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(fields[0], { target: { value: '2026-09-06T10:00' } });
    fireEvent.change(fields[1], { target: { value: '2026-09-05T10:00' } });
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(insert).not.toHaveBeenCalled();
    fireEvent.change(fields[1], { target: { value: '2026-09-07T10:00' } });
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });
});
