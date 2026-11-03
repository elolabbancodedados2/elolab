import { describe, expect, it } from 'vitest';
import { acoesDaEtapa } from './acoesDaEtapa';

describe('ações compartilhadas da recepção', () => {
  const item = { ag: { status: 'aguardando' }, step: 2, fila: { id: 'fila', cobranca_estado: 'gratuita' }, saldo: 0 };
  it('oferece check-in, contato e falta para quem ainda não chegou', () => {
    expect(acoesDaEtapa({ ...item, step: 0, atrasado: true, temTelefone: true })).toEqual({ principal: 'checkin', secundarias: ['a_caminho', 'falta'] });
  });
  it('preserva a retomada da cobrança no balcão', () => {
    expect(acoesDaEtapa({ ...item, step: 1, saldo: 50, fila: { id: 'fila', cobranca_estado: 'pendente' } })).toEqual({ principal: 'receber', secundarias: ['retomar_cobranca', 'chamar_balcao'] });
  });
  it('não oferece iniciar atendimento se falta triagem obrigatória', () => {
    expect(acoesDaEtapa({ ...item, faltaTriagem: true, podeTriagem: true })).toEqual({ principal: 'triagem', secundarias: ['chamar'] });
    expect(acoesDaEtapa({ ...item, faltaTriagem: true, podeTriagem: false }).principal).toBe('fila');
  });
  it('oferece chamar e atender quando liberado e abre fila se o vínculo ainda não chegou', () => {
    expect(acoesDaEtapa(item)).toEqual({ principal: 'iniciar', secundarias: ['chamar'] });
    expect(acoesDaEtapa({ ...item, fila: null }).principal).toBe('fila');
  });
  it('finaliza a consulta e só conclui a saída sem saldo pendente', () => {
    expect(acoesDaEtapa({ ...item, ag: { status: 'em_atendimento' } }).principal).toBe('finalizar');
    expect(acoesDaEtapa({ ...item, step: 3, saldo: 10 }).principal).toBe('receber_saldo');
    expect(acoesDaEtapa({ ...item, step: 3 }).principal).toBe('concluir');
  });
  it('oferece retorno para concluídos e reagendamento para faltas', () => {
    expect(acoesDaEtapa({ ...item, step: 4 }).principal).toBe('agendar_retorno');
    expect(acoesDaEtapa({ ...item, step: -1, ag: { status: 'faltou' }, temTelefone: true })).toEqual({ principal: 'reagendar', secundarias: ['whatsapp_reagendar'] });
  });
});
