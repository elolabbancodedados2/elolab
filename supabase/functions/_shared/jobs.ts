/**
 * Cliente da fila `jobs` (ADR 0003; migration 20261029120000_fila_jobs.sql).
 *
 * Produtores (webhooks) chamam `enfileirarJob` e respondem. O worker chama
 * `processarLote` com um registro de handlers por tipo. Entrega é "pelo menos
 * uma vez": todo handler precisa ser idempotente ou sinalizar `ErroJobIncerto`
 * quando falhar depois de um efeito externo não repetível.
 *
 * Só funciona com a service_role: as RPCs são negadas a anon e authenticated.
 */

export type StatusJob = 'pendente' | 'executando' | 'concluido' | 'incerto' | 'dead' | 'cancelado';

export interface Job<P = Record<string, unknown>> {
  id: string;
  tipo: string;
  clinica_id: string | null;
  chave_idempotencia: string;
  chave_ordenacao: string | null;
  payload: P;
  status: StatusJob;
  repetivel: boolean;
  tentativas: number;
  max_tentativas: number;
}

type ErroRpc = { message?: string; code?: string } | null;

/** Subconjunto do cliente Supabase usado aqui (facilita testes). */
export interface DbJobs {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErroRpc }>;
}

/** Erro que não adianta repetir (payload inválido, registro de outra clínica). Vai para `dead`. */
export class ErroJobDefinitivo extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
    this.name = 'ErroJobDefinitivo';
  }
}

/** Falha depois de um efeito externo não idempotente (ex.: mensagem já enviada). Vai para `incerto`. */
export class ErroJobIncerto extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
    this.name = 'ErroJobIncerto';
  }
}

export interface NovoJob {
  tipo: string;
  chaveIdempotencia: string;
  payload: Record<string, unknown>;
  clinicaId: string | null;
  chaveOrdenacao?: string | null;
  repetivel?: boolean;
  maxTentativas?: number;
}

/** Enfileira de forma idempotente. `criado = false` indica reentrega do mesmo evento. */
export async function enfileirarJob(db: DbJobs, job: NovoJob): Promise<{ jobId: string; criado: boolean }> {
  const { data, error } = await db.rpc('enfileirar_job', {
    p_tipo: job.tipo,
    p_chave_idempotencia: job.chaveIdempotencia,
    p_payload: job.payload,
    p_clinica_id: job.clinicaId,
    p_chave_ordenacao: job.chaveOrdenacao ?? null,
    p_repetivel: job.repetivel ?? false,
    p_max_tentativas: job.maxTentativas ?? 5,
  });
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) as { job_id?: string; criado?: boolean } | null;
  if (!linha?.job_id) throw new Error('enfileirar_job_sem_retorno');
  return { jobId: linha.job_id, criado: Boolean(linha.criado) };
}

export type HandlerJob = (job: Job) => Promise<void>;

export interface ResumoLote {
  reservados: number;
  concluidos: number;
  reagendados: number;
  dead: number;
  incertos: number;
}

/** Código curto e sem dado pessoal para gravar em `ultimo_erro`. */
export function codigoDeErro(error: unknown): string {
  if (error instanceof ErroJobDefinitivo || error instanceof ErroJobIncerto) return error.codigo.slice(0, 120);
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return `db_${code}`.slice(0, 120);
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name) return name.slice(0, 120);
  }
  return 'erro_desconhecido';
}

/**
 * Reserva um lote e executa os handlers em sequência. Cada job é concluído
 * ou marcado como falho individualmente; a falha de um não interrompe os
 * outros. Tipo sem handler vai para `dead`.
 */
export async function processarLote(
  db: DbJobs,
  handlers: Record<string, HandlerJob>,
  opcoes: { limite?: number; leaseSegundos?: number; porClinica?: number } = {},
): Promise<ResumoLote> {
  const tipos = Object.keys(handlers);
  const resumo: ResumoLote = { reservados: 0, concluidos: 0, reagendados: 0, dead: 0, incertos: 0 };
  if (!tipos.length) return resumo;

  const { data, error } = await db.rpc('reivindicar_jobs', {
    p_tipos: tipos,
    p_limite: opcoes.limite ?? 10,
    p_lease: `${opcoes.leaseSegundos ?? 120} seconds`,
    p_por_clinica: opcoes.porClinica ?? 10,
  });
  if (error) throw error;
  const jobs = (Array.isArray(data) ? data : []) as Job[];
  resumo.reservados = jobs.length;

  for (const job of jobs) {
    const handler = handlers[job.tipo];
    try {
      if (!handler) throw new ErroJobDefinitivo('tipo_sem_handler');
      await handler(job);
      const { error: erroConcluir } = await db.rpc('concluir_job', { p_job_id: job.id });
      if (erroConcluir) throw erroConcluir;
      resumo.concluidos++;
    } catch (erro) {
      const incerto = erro instanceof ErroJobIncerto;
      const definitivo = erro instanceof ErroJobDefinitivo;
      const { data: novoStatus, error: erroFalha } = await db.rpc('falhar_job', {
        p_job_id: job.id,
        p_erro: codigoDeErro(erro),
        p_definitivo: definitivo,
        p_incerto: incerto,
      });
      if (erroFalha) {
        // O lease expira e a regra de lease decide (incerto/pendente).
        console.error('[jobs] falha ao registrar erro do job', { tipo: job.tipo, code: erroFalha.code ?? null });
        continue;
      }
      if (novoStatus === 'incerto') resumo.incertos++;
      else if (novoStatus === 'dead') resumo.dead++;
      else if (novoStatus === 'pendente') resumo.reagendados++;
      console.error('[jobs] job falhou', { tipo: job.tipo, status: novoStatus ?? null, erro: codigoDeErro(erro) });
    }
  }
  return resumo;
}
