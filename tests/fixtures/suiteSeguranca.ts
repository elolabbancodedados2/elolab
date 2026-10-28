/**
 * Regras comuns das três suítes de segurança sobre quando pular.
 *
 * Fora do CI, sem Supabase local configurado, a suíte é pulada (quem roda
 * `npm run test:e2e` numa máquina sem Docker não deve ver vermelho por isso).
 *
 * No CI a suíte é obrigatória: configuração ausente vira FALHA, não skip.
 * Um job que de propósito não cobre estas suítes precisa declarar
 * `QA_SECURITY_SUITES=fora-deste-job`, para a ausência ficar visível no workflow.
 * `QA_SECURITY_REQUIRED=1` liga o modo obrigatório fora do CI.
 */
import type { Ambiente } from './duasClinicas.ts';

export const FORA_DESTE_JOB = 'fora-deste-job';

export function suiteObrigatoria(env: Ambiente = process.env): boolean {
  if (env.QA_SECURITY_SUITES === FORA_DESTE_JOB) return false;
  if (env.QA_SECURITY_REQUIRED === '1') return true;
  const ci = env.CI?.trim().toLowerCase();
  return Boolean(ci) && ci !== 'false' && ci !== '0';
}

/** Nomes das variáveis ausentes, na ordem informada. */
export function variaveisAusentes(nomes: readonly string[], env: Ambiente = process.env): string[] {
  return nomes.filter((nome) => !env[nome]?.trim());
}

/**
 * Devolve a mensagem de skip quando falta configuração e a suíte é opcional;
 * lança erro quando ela é obrigatória; devolve `null` quando está tudo certo.
 */
export function decidirSkipDeConfiguracao(
  contexto: string,
  faltando: readonly string[],
  env: Ambiente = process.env,
): string | null {
  if (!faltando.length) return null;
  const detalhe = `${contexto}: faltam ${faltando.join(', ')}.`;
  if (suiteObrigatoria(env)) {
    throw new Error(
      `Suíte de segurança obrigatória neste ambiente e sem configuração. ${detalhe} ` +
      'Rode o seed (node tests/fixtures/seed-duas-clinicas.ts) contra o Supabase local, ' +
      `ou declare QA_SECURITY_SUITES=${FORA_DESTE_JOB} no job que não cobre estas suítes.`,
    );
  }
  return detalhe;
}

/** Razão de skip que `tests/fixtures/gateSkip.ts` aceita pela allowlist. */
export function motivoSkipPermitido(chave: string, motivo: string): string {
  return `[skip-permitido:${chave}] ${motivo}`;
}

/** Variáveis-base que o seed grava e que as três suítes exigem. */
export const VARIAVEIS_BASE = ['QA_SUPABASE_URL', 'QA_SUPABASE_ANON_KEY', 'QA_SUPABASE_SERVICE_ROLE_KEY'] as const;
