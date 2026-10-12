export interface EventoAuditoriaExportavel {
  id: string;
  source?: string;
  ts: string;
  action: string;
  user_id: string | null;
  user_name: string | null;
  user_crm: string | null;
  prontuario_id: string | null;
  possuiDiff?: boolean;
  operacaoBanco?: string;
}

export function combinarEventosAuditoria(
  acessos: EventoAuditoriaExportavel[],
  alteracoes: EventoAuditoriaExportavel[],
): EventoAuditoriaExportavel[] {
  const eventos = [...acessos, ...alteracoes];
  const mesmoEvento = (a: EventoAuditoriaExportavel, b: EventoAuditoriaExportavel) =>
    a.prontuario_id === b.prontuario_id && a.user_id === b.user_id
    && Math.abs(new Date(a.ts).getTime() - new Date(b.ts).getTime()) <= 30_000;
  const acaoNormalizada = (acao: string) => acao === 'insert' ? 'create' : acao;
  const semDuplicatas = eventos.filter((evento) => {
    if (evento.source !== 'audit_log') return true;
    if (evento.action === 'access') return !acessos.some(acesso => mesmoEvento(evento, acesso));
    if (evento.action === 'update' || evento.action === 'create' || evento.action === 'insert') {
      // Eventos legados do cliente e do trigger eram gravados com poucos ms
      // de diferença. Com os diffs clínicos sanitizados, a duplicidade é
      // detectada somente pela identidade/ação e janela temporal curta.
      return !alteracoes.some(outra => outra !== evento && outra.source === 'audit_log'
        && acaoNormalizada(outra.action) === acaoNormalizada(evento.action)
        && Math.abs(new Date(evento.ts).getTime() - new Date(outra.ts).getTime()) <= 250
        && (new Date(outra.ts).getTime() < new Date(evento.ts).getTime()
          || (outra.ts === evento.ts && outra.id.localeCompare(evento.id) < 0))
        && mesmoEvento(evento, outra));
    }
    return true;
  });
  return semDuplicatas
    .map((evento) => ({ ...evento, action: evento.action === 'insert' ? 'create' : evento.action,
      id: `${evento.source || 'prontuario_acessos'}:${evento.id}` }))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export interface FiltrosAuditoria {
  dataInicial: string;
  dataFinal: string;
  acao: string;
  userId: string;
}

export interface MetadadosAuditoria {
  softwareNome: string;
  softwareFornecedor: string;
  softwareVersao: string;
  softwareBuild: string;
  instituicaoNome: string;
  instituicaoCnes: string;
  instituicaoCnpj: string;
}

export async function buscarTodasAsPaginas<T>(
  buscar: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tamanhoPagina = 500,
): Promise<T[]> {
  if (!Number.isSafeInteger(tamanhoPagina) || tamanhoPagina < 1) {
    throw new Error('O tamanho da página deve ser um inteiro positivo.');
  }
  const resultado: T[] = [];
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await buscar(inicio, inicio + tamanhoPagina - 1);
    if (error) throw error;
    const pagina = data ?? [];
    resultado.push(...pagina);
    if (pagina.length < tamanhoPagina) return resultado;
  }
}

export async function buscarPorIdsEmLotes<T>(
  ids: string[],
  buscar: (lote: string[]) => Promise<T[]>,
  tamanhoLote = 100,
): Promise<T[]> {
  if (!Number.isSafeInteger(tamanhoLote) || tamanhoLote < 1) {
    throw new Error('O tamanho do lote deve ser um inteiro positivo.');
  }
  const idsUnicos = [...new Set(ids.filter(Boolean))];
  const resultado: T[] = [];
  for (let inicio = 0; inicio < idsUnicos.length; inicio += tamanhoLote) {
    resultado.push(...await buscar(idsUnicos.slice(inicio, inicio + tamanhoLote)));
  }
  return resultado;
}

export function filtrarEventosAuditoria(
  eventos: EventoAuditoriaExportavel[],
  filtros: FiltrosAuditoria,
): EventoAuditoriaExportavel[] {
  return eventos.filter((evento) => {
    const instante = new Date(evento.ts);
    const data = Number.isNaN(instante.getTime()) ? '' : [
      instante.getFullYear(), String(instante.getMonth() + 1).padStart(2, '0'), String(instante.getDate()).padStart(2, '0'),
    ].join('-');
    return (!filtros.dataInicial || data >= filtros.dataInicial)
      && (!filtros.dataFinal || data <= filtros.dataFinal)
      && (filtros.acao === 'todos' || evento.action === filtros.acao)
      && (filtros.userId === 'todos' || evento.user_id === filtros.userId);
  });
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function gerarCsvAuditoria(eventos: EventoAuditoriaExportavel[], meta: MetadadosAuditoria): string {
  const rows = [
    ['Software', 'Fornecedor', 'Versão', 'Build', 'Instituição', 'CNES', 'CNPJ'],
    [meta.softwareNome, meta.softwareFornecedor, meta.softwareVersao, meta.softwareBuild,
      meta.instituicaoNome, meta.instituicaoCnes, meta.instituicaoCnpj],
    [],
    ['ID do evento', 'Origem', 'Data/hora (UTC)', 'Evento', 'Usuário (ID imutável)', 'Nome do usuário', 'CRM', 'Registro afetado (ID)'],
    ...eventos.map((evento) => [evento.id, evento.source || 'prontuario_acessos', evento.ts, evento.action, evento.user_id, evento.user_name, evento.user_crm, evento.prontuario_id]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
}
