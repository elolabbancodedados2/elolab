import { describe, expect, it } from 'vitest';
import { canaisDeLembrete, dentroDaJanelaDeContato } from '../../../supabase/functions/_shared/notificationDeliveryPolicy';

describe('política de entrega de lembretes', () => {
  it('mantém os dois canais para cadastros antigos sem preferência', () => {
    expect(canaisDeLembrete(null, true, true)).toEqual({ email: true, whatsapp: true });
  });

  it('respeita canal exclusivo e não troca para outro canal automaticamente', () => {
    expect(canaisDeLembrete('email', true, true)).toEqual({ email: true, whatsapp: false });
    expect(canaisDeLembrete('whatsapp', true, true)).toEqual({ email: false, whatsapp: true });
    expect(canaisDeLembrete('nenhum', true, true)).toEqual({ email: false, whatsapp: false });
  });

  it('não seleciona canal sem endereço cadastrado', () => {
    expect(canaisDeLembrete('email', false, true)).toEqual({ email: false, whatsapp: false });
    expect(canaisDeLembrete('whatsapp', true, false)).toEqual({ email: false, whatsapp: false });
  });

  it('permite contato dentro da janela local e bloqueia os limites', () => {
    expect(dentroDaJanelaDeContato('2026-10-14T14:00:00.000Z', '08:00', '20:00', 'America/Sao_Paulo')).toBe(true);
    expect(dentroDaJanelaDeContato('2026-10-14T11:00:00.000Z', '08:00', '20:00', 'America/Sao_Paulo')).toBe(true);
    expect(dentroDaJanelaDeContato('2026-10-14T10:59:59.000Z', '08:00', '20:00', 'America/Sao_Paulo')).toBe(false);
    expect(dentroDaJanelaDeContato('2026-10-14T23:00:00.000Z', '08:00', '20:00', 'America/Sao_Paulo')).toBe(false);
  });

  it('suporta janela que cruza meia-noite e bloqueia configuração inválida', () => {
    expect(dentroDaJanelaDeContato('2026-10-14T02:30:00.000Z', '22:00', '06:00', 'America/Sao_Paulo')).toBe(true);
    expect(dentroDaJanelaDeContato('2026-10-14T12:00:00.000Z', '22:00', '06:00', 'America/Sao_Paulo')).toBe(false);
    expect(dentroDaJanelaDeContato('2026-10-14T12:00:00.000Z', '08:00', '08:00', 'America/Sao_Paulo')).toBe(false);
    expect(dentroDaJanelaDeContato('2026-10-14T12:00:00.000Z', '8:00', '20:00', 'America/Sao_Paulo')).toBe(false);
    expect(dentroDaJanelaDeContato('2026-10-14T12:00:00.000Z', '08:00', '20:00', 'Invalid/Zone')).toBe(false);
  });
});
