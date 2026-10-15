import { describe, expect, it } from 'vitest';
import { evolutionWebhookPayload, parseEvolutionState, extractEvolutionQr } from '../../../supabase/functions/_shared/evolutionPayloads';

describe('Evolution v2 integration', () => {
  it('recognizes the nested connection state returned by v2', () => {
    expect(parseEvolutionState({ instance: { state: 'open' } })).toMatchObject({ connected: true, state: 'open', status: 'connected' });
  });
  it('keeps connecting separate from disconnected and supports the legacy root field', () => {
    expect(parseEvolutionState({ instance: { state: 'connecting' } }).status).toBe('connecting');
    expect(parseEvolutionState({ state: 'open' }).connected).toBe(true);
    expect(parseEvolutionState({ instance: { state: 'close' } }).connected).toBe(false);
    expect(parseEvolutionState(null).state).toBe('unknown');
  });
  it('does not invent or erase the phone when the state response does not contain it', () => {
    expect(parseEvolutionState({ instance: { state: 'open' } }).phoneNumber).toBeUndefined();
    expect(parseEvolutionState({ instance: { state: 'open', ownerJid: '5511999999999@s.whatsapp.net' } }).phoneNumber).toBe('5511999999999');
  });
  it('uses the required v2 webhook envelope, authentication and camelCase options', () => {
    expect(evolutionWebhookPayload('https://api.elolab.com.br/functions/v1/whatsapp-webhook', 'synthetic-key')).toEqual({
      webhook: { enabled: true, url: 'https://api.elolab.com.br/functions/v1/whatsapp-webhook', byEvents: false, base64: false,
        headers: { 'x-webhook-token': 'synthetic-key' }, events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'] },
    });
  });
  it('reads images and raw pairing codes without accepting empty responses', () => {
    expect(extractEvolutionQr({ qrcode: { base64: 'data:image/png;base64,synthetic' } })).toBe('data:image/png;base64,synthetic');
    expect(extractEvolutionQr({ code: 'raw-pairing-payload' })).toBe('raw-pairing-payload');
    expect(extractEvolutionQr({ count: 0 })).toBeNull();
  });
});
