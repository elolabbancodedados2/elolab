import { describe, expect, it } from 'vitest';
import { resumirErroFilaNotificacao } from '@/lib/notificationQueueErrorSummary';

describe('resumirErroFilaNotificacao', () => {
  it('classifica falhas conhecidas sem repetir a resposta bruta do provedor', () => {
    expect(resumirErroFilaNotificacao('Brevo HTTP 429')).toBe('O provedor de e-mail limitou os envios. Tente novamente mais tarde.');
    expect(resumirErroFilaNotificacao('Evolution 400: mensagem privada do paciente')).toBe('O provedor de WhatsApp recusou o envio. Revise o canal e o destinatário.');
    expect(resumirErroFilaNotificacao('Limite mensal de 500 notificações da clínica atingido.')).toBe('O limite mensal de envios da clínica foi atingido.');
  });

  it('reduz mensagens desconhecidas a um aviso genérico e não expõe segredos ou conteúdo', () => {
    const raw = 'Bearer eyJhbGciOiJIUzI1NiJ9.secret; BREVO_API_KEY=top-secret; conteúdo: diagnóstico confidencial';
    const summary = resumirErroFilaNotificacao(raw);
    expect(summary).toBe('Falha no processamento do envio. Consulte o suporte da clínica.');
    expect(summary).not.toContain('top-secret');
    expect(summary).not.toContain('diagnóstico confidencial');
  });

  it('dá orientação própria para envio com resultado incerto e configuração ausente', () => {
    expect(resumirErroFilaNotificacao('Resultado do provedor incerto: timeout')).toBe('O resultado do provedor é incerto. Confira antes de repetir o envio.');
    expect(resumirErroFilaNotificacao('BREVO_API_KEY não configurada')).toBe('A integração do canal está incompleta. Revise as configurações da clínica.');
    expect(resumirErroFilaNotificacao('EVOLUTION_API_URL/KEY não configurados')).toBe('A integração do canal está incompleta. Revise as configurações da clínica.');
  });

  it('explica limites de frequência sem exibir identificador do destinatário', () => {
    expect(resumirErroFilaNotificacao('Limite de envios por minuto da clínica atingido; envio reagendado.'))
      .toBe('O limite de envios por minuto da clínica foi atingido; a fila tentará novamente.');
    expect(resumirErroFilaNotificacao('Intervalo mínimo para este número ainda não foi atingido; envio reagendado.'))
      .toBe('O intervalo mínimo entre mensagens para este destinatário ainda não passou; a fila tentará novamente.');
  });
});
