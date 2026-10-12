import { describe, expect, it } from 'vitest';
import { aplicarReciboLeitura } from '../chatReadReceipt';
import { readFileSync } from 'node:fs';

const messages = [
  { id: 'm1', conversa_id: 'c1', clinica_id: 'clinic1', lida_em: null, texto: 'Oi' },
  { id: 'm2', conversa_id: 'c1', clinica_id: 'clinic1', lida_em: null, texto: 'Tudo bem?' },
];

describe('recibos de leitura do chat', () => {
  it('atualiza a mensagem aberta com o evento de leitura recebido por realtime', () => {
    const updated = aplicarReciboLeitura(messages, {
      id: 'm1', conversa_id: 'c1', clinica_id: 'clinic1', lida_em: '2026-10-11T12:00:00Z',
    }, 'c1', 'clinic1');

    expect(updated[0].lida_em).toBe('2026-10-11T12:00:00Z');
    expect(updated[1].lida_em).toBeNull();
    expect(messages[0].lida_em).toBeNull();
  });

  it('dá nomes acessíveis à busca, mensagem, urgência e emojis nos dois chats', () => {
    const chat = readFileSync('src/pages/ChatInterno.tsx', 'utf8');
    const panel = readFileSync('src/components/chat/ChatPanel.tsx', 'utf8');
    for (const source of [chat, panel]) {
      expect(source).toContain('aria-label="Buscar conversas e equipe"');
      expect(source).toContain('aria-label="Mensagem"');
      expect(source).toContain('aria-label={urgente ? \'Remover urgência\' : \'Marcar como urgente\'}');
      expect(source).toContain('aria-label={showEmojis ? \'Ocultar emojis\' : \'Mostrar emojis\'}');
    }
  });

  it('ignora recibos de outra conversa ou clínica', () => {
    const event = { id: 'm1', conversa_id: 'c1', clinica_id: 'clinic1', lida_em: '2026-10-11T12:00:00Z' };
    expect(aplicarReciboLeitura(messages, event, 'c2', 'clinic1')).toBe(messages);
    expect(aplicarReciboLeitura(messages, { ...event, clinica_id: 'clinic2' }, 'c1', 'clinic1')).toBe(messages);
  });
});
