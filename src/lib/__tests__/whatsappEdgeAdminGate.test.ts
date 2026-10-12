import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/whatsapp-evolution/index.ts', 'utf8');

describe('autorização da Edge Function WhatsApp', () => {
  it('nega usuário não-admin antes de executar qualquer ação privilegiada', () => {
    const gate = source.indexOf('if (!ehAdmin)');
    const dispatch = source.indexOf('switch (action)');
    expect(gate).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(gate);
    expect(source.slice(gate, dispatch)).toContain('status: 403');
  });

  it('não deixa ações privilegiadas fora do gate administrativo', () => {
    for (const action of ['generate_summary', 'send_message', 'send_media', 'check_status', 'request_satisfaction', 'create_instance', 'get_qr_code', 'delete_instance']) {
      expect(source).toContain(`case '${action}'`);
      expect(source.indexOf(`case '${action}'`)).toBeGreaterThan(source.indexOf('if (!ehAdmin)'));
    }
  });
});
