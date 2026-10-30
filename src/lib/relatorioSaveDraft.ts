export interface RelatorioSalvoRef {
  id: string;
  userId: string;
  updatedAt: string;
  ativo: boolean;
}

export interface RelatorioSaveForm {
  nome: string;
  descricao: string;
  frequencia: string;
  dia_semana: string;
  dia_mes: string;
  hora: string;
  destinatarios: string;
  formato: string;
}

export interface RelatorioSaveConfig {
  dataInicio: string;
  dataFim: string;
  statusFilter: string;
  medicoFilter: string;
  convenioFilter: string;
  textoBusca: string;
  limite: number;
  valorMin: string;
  valorMax: string;
  tipoLancamento: string;
  groupBy: string;
  colunas: string[];
}

export interface RelatorioSaveDraft {
  key: string;
  userId: string;
  clinicaId: string;
  dataset: string;
  datasetLabel: string;
  config: RelatorioSaveConfig;
  savedReport: RelatorioSalvoRef | null;
  form: RelatorioSaveForm;
}

let draftEmMemoria: RelatorioSaveDraft | null = null;

/** Guarda contexto sensível apenas durante a navegação atual, sem URL, storage ou banco. */
export function setRelatorioSaveDraft(draft: RelatorioSaveDraft | null) {
  draftEmMemoria = draft;
}

export function getRelatorioSaveDraft() {
  return draftEmMemoria;
}
