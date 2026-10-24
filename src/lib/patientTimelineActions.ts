export type TimelineEventType =
  | 'prontuario' | 'prescricao' | 'exame' | 'atestado' | 'encaminhamento'
  | 'agendamento' | 'pagamento' | 'triagem' | 'anexo' | 'retorno' | 'comorbidade';

export type TimelineAction = { label: string; href: string };

/**
 * Ação "abrir origem" de um evento da linha do tempo, limitada aos papéis das
 * rotas de destino (App.tsx). Pagamentos vêm de `lancamentos`, o financeiro da
 * clínica; a cobrança do plano EloLab nunca é destino daqui.
 */
export function timelineEventAction(
  event: { type: TimelineEventType; id: string; financeTipo?: string | null },
  roles: readonly string[],
  pacienteId: string,
): TimelineAction | null {
  const has = (...allowed: string[]) => allowed.some(role => roles.includes(role));
  const clinical = has('admin', 'medico');
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

  switch (event.type) {
    case 'agendamento':
      return clinical ? { label: 'Abrir atendimento', href: `/prontuarios?${q({ paciente: pacienteId, agendamento: event.id.replace(/^ag-/, '') })}` } : null;
    case 'prontuario':
      return clinical ? { label: 'Abrir prontuário', href: `/prontuarios?${q({ paciente: pacienteId })}` } : null;
    case 'prescricao':
      return clinical ? { label: 'Ver prescrições do paciente', href: `/documentos-clinicos?${q({ paciente: pacienteId })}` } : null;
    case 'atestado':
      return clinical ? { label: 'Ver atestados do paciente', href: `/documentos-clinicos?${q({ tab: 'atestados', paciente: pacienteId })}` } : null;
    case 'encaminhamento':
      return clinical ? { label: 'Abrir encaminhamentos', href: '/documentos-clinicos?tab=encaminhamentos' } : null;
    case 'anexo':
      return clinical ? { label: 'Abrir documentos anexados', href: '/documentos-clinicos?tab=anexos' } : null;
    case 'exame':
      return has('admin', 'medico', 'enfermagem') ? { label: 'Ver exames deste paciente', href: `/exames?${q({ paciente: pacienteId })}` } : null;
    case 'triagem':
      return has('admin', 'medico', 'enfermagem') ? { label: 'Abrir triagem do paciente', href: `/triagem?${q({ buscarPaciente: pacienteId })}` } : null;
    case 'retorno':
      return has('admin', 'medico', 'recepcao') ? { label: 'Abrir retornos', href: '/retornos' } : null;
    case 'pagamento':
      if (!has('admin', 'financeiro')) return null;
      return event.financeTipo === 'despesa'
        ? { label: 'Abrir contas a pagar da clínica', href: '/contas?tab=pagar' }
        : { label: 'Abrir contas a receber da clínica', href: '/contas?tab=receber' };
    default:
      return null;
  }
}
