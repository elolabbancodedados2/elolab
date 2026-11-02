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

/**
 * Preparo configurado no catálogo para cada exame pedido. O nome gravado pode
 * vir com o código na frente ("40302040 - Glicemia em Jejum"); o código é
 * ignorado na comparação.
 */
export function preparosDosExames(
  exames: string[],
  catalogo: Array<{ nome: string; preparo: string | null }>,
): PreparoAusente[] {
  const preparoPorNome = new Map(catalogo.map(item => [normalizarTexto(item.nome), (item.preparo ?? '').trim()]));
  const vistos = new Set<string>();
  return exames.flatMap(nomeGravado => {
    const nome = nomeGravado.replace(/^[A-Za-z0-9.]+\s+-\s+/, '').trim();
    const chave = normalizarTexto(nome);
    const preparo = preparoPorNome.get(chave) ?? preparoPorNome.get(normalizarTexto(nomeGravado)) ?? '';
    if (!preparo || vistos.has(chave)) return [];
    vistos.add(chave);
    return [{ exame: nome, preparo }];
  });
}

/** Mensagem curta para enviar o preparo ao paciente pelo WhatsApp. */
export function mensagemPreparoWhatsApp(nomePaciente: string, preparos: PreparoAusente[], clinica?: string | null): string {
  const primeiroNome = nomePaciente.trim().split(/\s+/)[0] || 'paciente';
  const linhas = preparos.map(item => `• ${item.exame}: ${item.preparo}`);
  return [
    `Olá, ${primeiroNome}! Seguem as orientações de preparo para os seus exames${clinica ? ` na ${clinica}` : ''}:`,
    ...linhas,
    'Em caso de dúvida, responda esta mensagem.',
  ].join('\n');
}
