import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENDAMENTO_STATUS } from './agendamentoStatus';

describe('catálogo de status do agendamento', () => {
  it('cobre todos os valores do enum e do trigger do banco com rótulo, cor, grupo e etapa', () => {
    const sql = readdirSync('supabase/migrations').sort().map(file => readFileSync(`supabase/migrations/${file}`, 'utf8')).join('\n');
    const trechos = [...sql.matchAll(/CREATE TYPE public\.status_agendamento AS ENUM \(([^)]+)\)|ALTER TYPE public\.status_agendamento ADD VALUE IF NOT EXISTS ('[^']+')/g)];
    const trigger = readFileSync('supabase/migrations/20261102300000_trava_triagem_e_finalizacao.sql', 'utf8').split('v_permitidos := CASE')[1].split('END;')[0];
    const statuses = new Set([...trechos.map(match => match[1] ?? match[2]), trigger].flatMap(text => [...text.matchAll(/'([^']+)'/g)].map(match => match[1])));
    expect(statuses.size).toBeGreaterThanOrEqual(13);
    for (const status of statuses) {
      const config = AGENDAMENTO_STATUS[status];
      expect(config, status).toBeDefined();
      expect(config.label).not.toContain('_');
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.color).toBeTruthy();
      expect(config.grupo).toBeTruthy();
      expect(config.etapa).toBeGreaterThanOrEqual(-1);
    }
  });
});
