import { formatCsvCell } from './csv';
import { perfilPublicoPortal } from '../../supabase/functions/_shared/portalSecurity';

export async function prepararCsvPacientes(
  patients: Record<string, unknown>[], admin: boolean, fullCpf: boolean,
  audit: (count: number, fullCpf: boolean) => Promise<boolean>,
): Promise<string> {
  if (!admin) throw new Error('Somente administrador pode exportar pacientes.');
  const rows = patients.map(p => [p.nome, p.nome_social || '', fullCpf ? p.cpf || '' : perfilPublicoPortal(p).cpf || '',
    p.telefone || '', p.email || '', p.nascimento || '', p.convenio || '', p.ativo === false ? 'Inativo' : 'Ativo']);
  if (!await audit(rows.length, fullCpf)) throw new Error('Não foi possível gravar a auditoria. Tente novamente.');
  return [['Nome', 'Nome social', 'CPF', 'Telefone', 'E-mail', 'Nascimento', 'Convênio', 'Status'], ...rows]
    .map(cols => cols.map(formatCsvCell).join(';')).join('\r\n');
}
