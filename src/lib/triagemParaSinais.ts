// Converte a linha de `triagens` para o formato de sinais vitais do prontuário,
// para o médico ver e copiar o que a enfermagem já registrou.

export interface TriagemSinais {
  pressao_arterial?: string | null;
  frequencia_cardiaca?: number | null;
  frequencia_respiratoria?: number | null;
  temperatura?: number | string | null;
  saturacao?: number | null;
  peso?: number | string | null;
  altura?: number | string | null;
  imc?: number | string | null;
  glicemia?: number | string | null;
  dor_escala?: number | null;
  data_hora?: string | null;
}

export type SinaisDaTriagem = Record<
  'pressao_sistolica' | 'pressao_diastolica' | 'frequencia_cardiaca' | 'frequencia_respiratoria'
  | 'temperatura' | 'saturacao' | 'peso' | 'altura' | 'imc' | 'glicemia' | 'dor',
  string
>;

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

export function triagemParaSinais(triagem: TriagemSinais): SinaisDaTriagem {
  const [sistolica = '', diastolica = ''] = texto(triagem.pressao_arterial).split(/[/xX]/).map(parte => parte.trim());
  return {
    pressao_sistolica: /^\d+$/.test(sistolica) ? sistolica : '',
    pressao_diastolica: /^\d+$/.test(diastolica) ? diastolica : '',
    frequencia_cardiaca: texto(triagem.frequencia_cardiaca),
    frequencia_respiratoria: texto(triagem.frequencia_respiratoria),
    temperatura: texto(triagem.temperatura),
    saturacao: texto(triagem.saturacao),
    peso: texto(triagem.peso),
    altura: texto(triagem.altura),
    imc: texto(triagem.imc),
    glicemia: texto(triagem.glicemia),
    dor: texto(triagem.dor_escala),
  };
}

export function temSinaisPreenchidos(sinais: object | null | undefined): boolean {
  if (!sinais) return false;
  return Object.values(sinais).some(valor => texto(valor) !== '');
}
