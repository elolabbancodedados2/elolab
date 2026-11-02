export interface VitalSignData {
  id: string;
  paciente_id: string;
  pressao_sistolica: number | null;
  pressao_diastolica: number | null;
  frequencia_cardiaca: number | null;
  frequencia_respiratoria: number | null;
  temperatura: number | null;
  peso: number | null;
  altura: number | null;
  imc: number | null;
  oxigenacao: number | null;
  glicemia: number | null;
  dor_escala: number | null;
  created_at: string;
}

export interface TriagemVitalsRow {
  id: string;
  paciente_id: string;
  agendamento_id: string | null;
  pressao_arterial: string | null;
  frequencia_cardiaca: number | string | null;
  frequencia_respiratoria: number | string | null;
  temperatura: number | string | null;
  peso: number | string | null;
  altura: number | string | null;
  imc: number | string | null;
  saturacao: number | string | null;
  glicemia: number | string | null;
  dor_escala: number | string | null;
  data_hora: string | null;
  created_at: string;
}

export interface ProntuarioVitalsRow {
  id: string;
  paciente_id: string;
  agendamento_id: string | null;
  data: string;
  created_at: string;
  sinais_vitais: unknown;
}

type VitalKey = Exclude<keyof VitalSignData, 'id' | 'paciente_id' | 'created_at'>;

const parseNumero = (valor: unknown): number | null => {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const numero = Number(valor.trim().replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
};

const separarPressao = (valor: unknown): [number | null, number | null] => {
  if (typeof valor !== 'string') return [null, null];
  const [sistolica, diastolica] = valor.split('/').map(parseNumero);
  return [sistolica ?? null, diastolica ?? null];
};

const mapaSinaisProntuario: Partial<Record<string, VitalKey>> = {
  pressao_sistolica: 'pressao_sistolica',
  pressao_diastolica: 'pressao_diastolica',
  frequencia_cardiaca: 'frequencia_cardiaca',
  frequencia_respiratoria: 'frequencia_respiratoria',
  temperatura: 'temperatura',
  peso: 'peso',
  altura: 'altura',
  imc: 'imc',
  saturacao: 'oxigenacao',
  oxigenacao: 'oxigenacao',
  glicemia: 'glicemia',
  dor: 'dor_escala',
  dor_escala: 'dor_escala',
};

function sinaisDoProntuario(valor: unknown): Pick<VitalSignData, VitalKey> {
  const sinais = valor && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
  const resultado = Object.fromEntries(
    (Object.keys(mapaSinaisProntuario) as Array<keyof typeof mapaSinaisProntuario>)
      .map((chave) => [mapaSinaisProntuario[chave], parseNumero(sinais[chave])])
      // Aliases (saturacao/oxigenacao, dor/dor_escala) share a key: an absent alias must not erase a recorded value.
      .filter(([chave, numero]) => Boolean(chave) && numero != null),
  ) as Partial<Record<VitalKey, number | null>>;

  return {
    pressao_sistolica: resultado.pressao_sistolica ?? null,
    pressao_diastolica: resultado.pressao_diastolica ?? null,
    frequencia_cardiaca: resultado.frequencia_cardiaca ?? null,
    frequencia_respiratoria: resultado.frequencia_respiratoria ?? null,
    temperatura: resultado.temperatura ?? null,
    peso: resultado.peso ?? null,
    altura: resultado.altura ?? null,
    imc: resultado.imc ?? null,
    oxigenacao: resultado.oxigenacao ?? null,
    glicemia: resultado.glicemia ?? null,
    dor_escala: resultado.dor_escala ?? null,
  };
}

function dataClinicaDoProntuario(data: string, fallback: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return fallback;
  const timestampClinico = `${data}T12:00:00-03:00`;
  return Number.isFinite(Date.parse(timestampClinico)) ? timestampClinico : fallback;
}

export function consolidarHistoricoVitais(
  triagens: TriagemVitalsRow[],
  prontuarios: ProntuarioVitalsRow[],
): VitalSignData[] {
  const agrupados = new Map<string, VitalSignData>();
  const atendimentoMaisRecente = new Map<string, string>();

  // Dados legados podem conter mais de uma evolução por atendimento. Mantemos
  // todas no histórico e escolhemos a mais recente para combinar com a triagem.
  for (const prontuario of prontuarios) {
    if (!prontuario.agendamento_id) continue;
    const atualId = atendimentoMaisRecente.get(prontuario.agendamento_id);
    const atual = prontuarios.find((item) => item.id === atualId);
    if (!atual || Date.parse(prontuario.created_at) > Date.parse(atual.created_at)) {
      atendimentoMaisRecente.set(prontuario.agendamento_id, prontuario.id);
    }
  }

  for (const triagem of triagens) {
    const [pressao_sistolica, pressao_diastolica] = separarPressao(triagem.pressao_arterial);
    const registro: VitalSignData = {
      id: triagem.id,
      paciente_id: triagem.paciente_id,
      pressao_sistolica,
      pressao_diastolica,
      frequencia_cardiaca: parseNumero(triagem.frequencia_cardiaca),
      frequencia_respiratoria: parseNumero(triagem.frequencia_respiratoria),
      temperatura: parseNumero(triagem.temperatura),
      peso: parseNumero(triagem.peso),
      altura: parseNumero(triagem.altura),
      imc: parseNumero(triagem.imc),
      oxigenacao: parseNumero(triagem.saturacao),
      glicemia: parseNumero(triagem.glicemia),
      dor_escala: parseNumero(triagem.dor_escala),
      created_at: triagem.data_hora || triagem.created_at,
    };
    agrupados.set(`triagem:${triagem.id}`, registro);
  }

  for (const prontuario of prontuarios) {
    const deveCombinarComTriagem = Boolean(
      prontuario.agendamento_id
      && atendimentoMaisRecente.get(prontuario.agendamento_id) === prontuario.id,
    );
    const triagemCorrespondente = deveCombinarComTriagem
      ? [...agrupados.values()].find((registro) => {
          const triagem = triagens.find((item) => item.id === registro.id);
          return triagem?.agendamento_id === prontuario.agendamento_id;
        })
      : undefined;
    const existente = triagemCorrespondente;
    const novosSinais = sinaisDoProntuario(prontuario.sinais_vitais);
    const temSinalRegistrado = Object.values(novosSinais).some((valor) => valor !== null);
    if (!existente && !temSinalRegistrado) continue;
    const sinais = Object.fromEntries(
      (Object.keys(novosSinais) as VitalKey[]).map((campo) => [campo, novosSinais[campo] ?? existente?.[campo] ?? null]),
    ) as Pick<VitalSignData, VitalKey>;
    if (existente) agrupados.delete(`triagem:${existente.id}`);
    agrupados.set(`prontuario:${prontuario.id}`, {
      id: prontuario.id,
      paciente_id: existente?.paciente_id ?? prontuario.paciente_id,
      ...sinais,
      // A triagem registra o horário da medição. Sem triagem vinculada, o
      // prontuário só tem uma data clínica, então posicionamos no meio-dia local.
      created_at: existente?.created_at ?? dataClinicaDoProntuario(prontuario.data, prontuario.created_at),
    });
  }

  return [...agrupados.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** CSV das medições (sem identificação do paciente), com hora de Brasília. */
export function gerarCsvVitais(registros: VitalSignData[]): string {
  const cabecalho = ['Data e hora', 'PA sistólica', 'PA diastólica', 'FC', 'FR', 'Temperatura', 'Peso', 'IMC', 'SpO2', 'Glicemia', 'Dor'];
  const valor = (n: number | null) => (n === null || !Number.isFinite(n) ? '' : String(n).replace('.', ','));
  const dataHora = (iso: string) => {
    const instante = new Date(iso);
    if (!Number.isFinite(instante.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(instante).replace(',', '');
  };
  const linhas = registros.map(r => [
    dataHora(r.created_at),
    valor(r.pressao_sistolica), valor(r.pressao_diastolica), valor(r.frequencia_cardiaca), valor(r.frequencia_respiratoria),
    valor(r.temperatura), valor(r.peso), valor(r.imc), valor(r.oxigenacao), valor(r.glicemia), valor(r.dor_escala),
  ]);
  return [cabecalho, ...linhas].map(linha => linha.map(campo => `"${campo.replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

export function historicoVitaisLimitado(
  triagensCount: number,
  prontuariosCount: number,
  registrosConsolidados: number,
  limite: number,
): boolean {
  return registrosConsolidados > limite || triagensCount > limite || prontuariosCount > limite;
}
