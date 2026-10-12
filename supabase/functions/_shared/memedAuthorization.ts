export type MemedAction = 'prepare' | 'prescription_printed' | 'prescription_deleted';

export interface MedemPrescriber {
  user_id: string | null;
  clinica_id: string | null;
  ativo: boolean | null;
}

export function autorizarAcaoMemed(
  action: string,
  userId: string,
  roles: string[],
  medico: MedemPrescriber | null,
  clinicaId: string,
): action is MemedAction {
  const actionValida = ['prepare', 'prescription_printed', 'prescription_deleted'].includes(action);
  return actionValida
    && roles.includes('medico')
    && !!medico
    && medico.user_id === userId
    && medico.clinica_id === clinicaId
    && medico.ativo !== false;
}
