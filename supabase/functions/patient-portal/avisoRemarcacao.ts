/**
 * Registro e aviso de uma remarcação feita pelo paciente no portal.
 *
 * Roda DEPOIS que a consulta já foi gravada no novo horário. Por isso nunca
 * lança: uma falha aqui não pode fazer o paciente achar que a remarcação não
 * aconteceu. O resultado de cada parte volta para quem chamou decidir o que
 * dizer ao paciente, e as falhas vão para o log da função.
 *
 *   * `audit_log`: trilha consultável pela administração da clínica
 *     (mesmo formato de `src/lib/auditTrail.ts`: campo/valor antigo/valor novo).
 *   * `notification_queue`: e-mail operacional ao dono da clínica, se ele tiver
 *     e-mail válido — mesmo destinatário do alerta de avaliação baixa.
 *
 * Logs só com ids: nome de paciente não vai para o log da função.
 */

export const ORIGEM_PORTAL = 'portal do paciente';

export interface Horario {
  data: string;
  hora_inicio: string | null;
}

export interface DadosRemarcacao {
  agendamentoId: string;
  clinicaId: string;
  pacienteId: string;
  anterior: Horario;
  nova: Horario;
}

export interface ResultadoRegistroRemarcacao {
  auditoria: 'registrada' | 'falhou';
  aviso_clinica: 'enfileirado' | 'sem_responsavel' | 'sem_email' | 'falhou';
}

type Log = Pick<Console, 'warn' | 'error'>;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Assunto fixo: vai como cabeçalho de texto puro e não carrega dado do paciente. */
export const ASSUNTO_AVISO_REMARCACAO = 'Consulta remarcada pelo portal do paciente';

/**
 * `process-notification-queue` envia `conteudo` como HTML (troca \n por <br>).
 * Todo valor vindo do banco é escapado antes de entrar no texto, para que um
 * nome de paciente ou de clínica não injete markup no e-mail.
 */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function horaCurta(hora: string | null): string | null {
  return hora ? String(hora).slice(0, 5) : null;
}

function descrever(h: Horario): string {
  const [ano, mes, dia] = h.data.split('-');
  const hora = horaCurta(h.hora_inicio);
  return `${dia}/${mes}/${ano}${hora ? ` às ${hora}` : ' (sem horário definido)'}`;
}

/**
 * Resumo seguro de um erro para log: só o código (SQLSTATE/PostgREST) ou o
 * tipo. `message`, `details` e `hint` do PostgREST podem trazer valores da
 * linha (nome, CPF...), então nunca vão para o log.
 */
export function resumoErro(erro: unknown): string {
  const codigo = (erro as { code?: unknown } | null)?.code;
  if (typeof codigo === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(codigo)) return `codigo=${codigo}`;
  if (erro instanceof Error) return `tipo=${erro.name}`;
  return 'tipo=desconhecido';
}

async function buscar(
  db: any,
  tabela: string,
  colunas: string,
  filtros: Record<string, string>,
  log: Log,
): Promise<any | null> {
  try {
    let consulta = db.from(tabela).select(colunas);
    for (const [coluna, valor] of Object.entries(filtros)) consulta = consulta.eq(coluna, valor);
    const { data, error } = await consulta.maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (erro) {
    log.warn(`[remarcacao-portal] não foi possível ler ${tabela} ${filtros.id} (${resumoErro(erro)}).`);
    return null;
  }
}

export async function registrarRemarcacao(
  db: any,
  dados: DadosRemarcacao,
  log: Log = console,
): Promise<ResultadoRegistroRemarcacao> {
  const ids = `agendamento=${dados.agendamentoId} clinica=${dados.clinicaId}`;
  const [clinica, paciente] = await Promise.all([
    buscar(db, 'clinicas', 'nome, owner_id', { id: dados.clinicaId }, log),
    // Também pela clínica: uma referência inconsistente não pode trazer o nome
    // de um paciente de outra clínica para a auditoria ou o e-mail.
    buscar(db, 'pacientes', 'nome', { id: dados.pacienteId, clinica_id: dados.clinicaId }, log),
  ]);
  const nomePaciente: string = paciente?.nome || 'Paciente';
  const nomeClinica: string = clinica?.nome || 'sua clínica';

  // ─── Trilha de auditoria ───
  let auditoria: ResultadoRegistroRemarcacao['auditoria'] = 'registrada';
  try {
    const { error } = await db.from('audit_log').insert({
      action: 'update',
      collection: 'agendamentos',
      record_id: dados.agendamentoId,
      record_name: nomePaciente,
      clinica_id: dados.clinicaId,
      user_id: null,
      user_name: 'Paciente (portal do paciente)',
      changes: [
        { field: 'data', oldValue: dados.anterior.data, newValue: dados.nova.data },
        { field: 'hora_inicio', oldValue: horaCurta(dados.anterior.hora_inicio), newValue: horaCurta(dados.nova.hora_inicio) },
        { field: 'origem', oldValue: null, newValue: ORIGEM_PORTAL },
      ],
    });
    if (error) throw error;
  } catch (erro) {
    auditoria = 'falhou';
    log.error(`[remarcacao-portal] auditoria não gravada (${ids}; ${resumoErro(erro)}).`);
  }

  // ─── Aviso ao responsável pela clínica ───
  let aviso_clinica: ResultadoRegistroRemarcacao['aviso_clinica'];
  const responsavel = clinica?.owner_id
    ? await buscar(db, 'profiles', 'id, nome, email', { id: clinica.owner_id }, log)
    : null;
  const email = typeof responsavel?.email === 'string' ? responsavel.email.trim() : '';

  if (!responsavel) {
    aviso_clinica = 'sem_responsavel';
    log.warn(`[remarcacao-portal] clínica sem responsável para avisar (${ids}).`);
  } else if (!EMAIL_VALIDO.test(email)) {
    aviso_clinica = 'sem_email';
    log.warn(`[remarcacao-portal] responsável da clínica sem e-mail válido (${ids}).`);
  } else {
    try {
      const { error } = await db.from('notification_queue').insert({
        tipo: 'email',
        destinatario_id: responsavel.id,
        destinatario_email: email,
        destinatario_nome: responsavel.nome ?? null,
        assunto: ASSUNTO_AVISO_REMARCACAO,
        conteudo:
          `${escaparHtml(nomePaciente)} remarcou uma consulta pelo portal do paciente em ${escaparHtml(nomeClinica)}.\n` +
          `Horário anterior: ${escaparHtml(descrever(dados.anterior))}\n` +
          `Novo horário: ${escaparHtml(descrever(dados.nova))}\n` +
          'A consulta voltou para "agendado" e precisa de nova confirmação.',
        status: 'pendente',
        clinica_id: dados.clinicaId,
        dados_extras: {
          tipo: 'remarcacao_portal',
          origem: ORIGEM_PORTAL,
          agendamento_id: dados.agendamentoId,
          paciente_id: dados.pacienteId,
          anterior: { data: dados.anterior.data, hora_inicio: horaCurta(dados.anterior.hora_inicio) },
          nova: { data: dados.nova.data, hora_inicio: horaCurta(dados.nova.hora_inicio) },
        },
      });
      if (error) throw error;
      aviso_clinica = 'enfileirado';
    } catch (erro) {
      aviso_clinica = 'falhou';
      log.error(`[remarcacao-portal] aviso à clínica não enfileirado (${ids}; ${resumoErro(erro)}).`);
    }
  }

  return { auditoria, aviso_clinica };
}
