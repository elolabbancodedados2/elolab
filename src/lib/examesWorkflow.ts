import { normalizarTexto } from '@/lib/buscaPaciente';

export type StatusExameWorkflow = 'solicitado' | 'agendado' | 'realizado' | 'laudo_disponivel' | 'cancelado';
export type RoleExame = 'admin' | 'medico' | 'recepcao' | 'enfermagem' | 'financeiro' | string;

export function podeExcluirExame(roles: RoleExame[] = []): boolean {
  return roles.includes('admin') || roles.includes('recepcao');
}

export function proximaAcaoExame(
  status: StatusExameWorkflow,
  categoria: string | null | undefined,
): { destino: 'status'; status: StatusExameWorkflow } | { destino: 'laboratorio' } | { destino: 'nenhum' } {
  if (status === 'laudo_disponivel' || status === 'cancelado') return { destino: 'nenhum' };
  const laboratorial = (categoria || '').trim().toLocaleLowerCase('pt-BR') === 'laboratorial';
  if (laboratorial && (status === 'agendado' || status === 'realizado')) return { destino: 'laboratorio' };
  const proximo: Partial<Record<StatusExameWorkflow, StatusExameWorkflow>> = {
    solicitado: 'agendado',
    agendado: 'realizado',
    realizado: 'laudo_disponivel',
  };
  const statusSeguinte = proximo[status];
  return statusSeguinte ? { destino: 'status', status: statusSeguinte } : { destino: 'nenhum' };
}

export type PreparoAusente = { exame: string; preparo: string };

/** Exames da guia cujo preparo configurado no catálogo não aparece no texto da guia. */
export function preparosAusentesNaGuia(
  exames: Array<{ nome: string }>,
  catalogo: Array<{ nome: string; preparo: string | null }>,
  textoGuia: string,
): PreparoAusente[] {
  const preparoPorNome = new Map(catalogo.map(item => [normalizarTexto(item.nome), (item.preparo ?? '').trim()]));
  const guia = normalizarTexto(textoGuia);
  return exames.flatMap(exame => {
    const preparo = preparoPorNome.get(normalizarTexto(exame.nome)) ?? '';
    return preparo && !guia.includes(normalizarTexto(preparo)) ? [{ exame: exame.nome, preparo }] : [];
  });
}

export function textoPreparosParaGuia(ausentes: PreparoAusente[]): string {
  return ausentes.map(item => `Preparo — ${item.exame}: ${item.preparo}`).join('\n');
}
