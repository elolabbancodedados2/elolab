import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import PlatformConsumo from '@/pages/PlatformConsumo';
import PlatformComunicacao from '@/pages/PlatformComunicacao';

const { rpc, insert } = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({ insert }) } }));
vi.mock('@/contexts/SupabaseAuthContext', () => ({ useSupabaseAuth: () => ({ user: { id: 'test' } }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === 'platform-usage' ? {
    generated_at: '2026-10-07T12:00:00.000Z',
    clinics: [{
      clinica_id: 'test', clinica_nome: 'Clínica teste', max_users: 10, users_used: 1,
      max_ai_tokens: 5000, ai_tokens_used: 0, max_notifications: 100, notifications_used: 0,
    }],
  } : [] }),
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
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Aviso' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Mensagem teste' } });
    const fields = container.querySelectorAll('input[type="datetime-local"]');
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(9, 0, 0, 0);
    const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    fireEvent.change(fields[0], { target: { value: value(start) } });
    fireEvent.change(fields[1], { target: { value: value(end) } });
    expect(screen.getByRole('button', { name: /Publicar comunicado/ })).toBeDisabled();
    expect(insert).not.toHaveBeenCalled();
    end.setHours(11, 0, 0, 0);
    fireEvent.change(fields[1], { target: { value: value(end) } });
    expect(screen.getByRole('button', { name: /Publicar comunicado/ })).toBeEnabled();
  });

  it('bloqueia comunicado cujo período já terminou', () => {
    const { container } = render(<PlatformComunicacao />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Aviso encerrado' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Este aviso não deve ser publicado.' } });
    const fields = container.querySelectorAll('input[type="datetime-local"]');
    const start = new Date();
    start.setDate(start.getDate() - 2);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    fireEvent.change(fields[0], { target: { value: value(start) } });
    fireEvent.change(fields[1], { target: { value: value(end) } });
    expect(screen.getByText(/data final precisa estar no futuro/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publicar comunicado/ })).toBeDisabled();
  });
});
