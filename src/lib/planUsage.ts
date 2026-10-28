export interface RecursoPlano {
  chave: string;
  rotulo: string;
  usado: number;
  limite: number | null;
  restante: number | null;
}

export interface PlanLimits {
  plano_nome: string | null;
  verificadoEm: string;
  recursos: RecursoPlano[];
  max_medicos: number | null;
  max_recepcao: number | null;
  max_funcionarios_total: number | null;
  current: { medicos: number; funcionarios_total: number };
  canAdd: { medico: boolean; funcionario: boolean };
}

type UsoServidor = {
  verificado_em: string;
  plano_nome: string | null;
  recursos: Array<{ chave: string; rotulo: string; usado: number | string; limite: number | string | null }>;
};

/** Converte a resposta de `uso_plano_clinica()`; sem limite (sem plano) não há vaga, como no servidor. */
export function mapearUsoPlano(data: UsoServidor): PlanLimits {
  const recursos = (data.recursos || []).map((r) => {
    const usado = Number(r.usado ?? 0);
    const limite = r.limite === null || r.limite === undefined ? null : Number(r.limite);
    return { chave: r.chave, rotulo: r.rotulo, usado, limite, restante: limite === null ? null : Math.max(0, limite - usado) };
  });
  const recurso = (chave: string) => recursos.find((r) => r.chave === chave);
  const vaga = (chave: string) => (recurso(chave)?.restante ?? 0) > 0;
  return {
    plano_nome: data.plano_nome ?? null,
    verificadoEm: data.verificado_em,
    recursos,
    max_medicos: recurso('medicos')?.limite ?? null,
    max_recepcao: recurso('recepcao')?.limite ?? null,
    max_funcionarios_total: recurso('funcionarios')?.limite ?? null,
    current: { medicos: recurso('medicos')?.usado ?? 0, funcionarios_total: recurso('funcionarios')?.usado ?? 0 },
    canAdd: { medico: vaga('funcionarios') && vaga('medicos'), funcionario: vaga('funcionarios') },
  };
}
