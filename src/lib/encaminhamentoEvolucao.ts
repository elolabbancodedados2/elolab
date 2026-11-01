/**
 * Regras do formulário de encaminhamento, separadas para teste.
 */

const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Lista de especialidades: a padrão mais as cadastradas nos médicos da
 * clínica, sem repetir (ignora caixa e acento), em ordem alfabética e com
 * "Outras" no fim.
 */
export function combinarEspecialidades(padrao: string[], daClinica: Array<string | null | undefined>): string[] {
  const vistas = new Map<string, string>();
  for (const item of [...padrao, ...daClinica]) {
    const nome = (item ?? '').trim();
    if (!nome || normalizar(nome) === 'outras') continue;
    if (!vistas.has(normalizar(nome))) vistas.set(normalizar(nome), nome);
  }
  return [...[...vistas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')), 'Outras'];
}

interface EvolucaoParaEncaminhamento {
  queixa_principal?: string | null;
  historia_doenca_atual?: string | null;
  hipotese_diagnostica?: string | null;
  diagnostico_principal?: string | null;
  conduta?: string | null;
  plano_terapeutico?: string | null;
  medicamentos_em_uso?: string | null;
}

/** Rascunho de encaminhamento com o que a evolução já registra. */
export function rascunhoDaEvolucao(evolucao: EvolucaoParaEncaminhamento): {
  motivo?: string;
  hipotese_diagnostica?: string;
  cid_principal?: string;
  tratamento_atual?: string;
} {
  const limpo = (valor?: string | null) => (valor ?? '').trim();
  const motivo = [
    limpo(evolucao.queixa_principal) && `Queixa: ${limpo(evolucao.queixa_principal)}`,
    limpo(evolucao.historia_doenca_atual) && `História: ${limpo(evolucao.historia_doenca_atual)}`,
  ].filter(Boolean).join('\n');
  const hipotese = limpo(evolucao.diagnostico_principal) || limpo(evolucao.hipotese_diagnostica);
  const tratamento = [
    limpo(evolucao.conduta) && `Conduta: ${limpo(evolucao.conduta)}`,
    limpo(evolucao.plano_terapeutico) && `Plano: ${limpo(evolucao.plano_terapeutico)}`,
    limpo(evolucao.medicamentos_em_uso) && `Medicamentos em uso: ${limpo(evolucao.medicamentos_em_uso)}`,
  ].filter(Boolean).join('\n');
  return {
    ...(motivo ? { motivo } : {}),
    ...(hipotese ? { hipotese_diagnostica: hipotese, cid_principal: hipotese } : {}),
    ...(tratamento ? { tratamento_atual: tratamento } : {}),
  };
}
