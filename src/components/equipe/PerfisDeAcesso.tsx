import { Check, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { menuGroups } from '@/config/sidebarMenu';
import type { AppRole } from '@/contexts/SupabaseAuthContext';

// Matriz do protótipo aprovado em 30/10/2026: perfil × módulo, lida da mesma configuração que monta o menu.
const PERFIS: Array<{ id: AppRole; rotulo: string }> = [
  { id: 'admin', rotulo: 'Administrador' },
  { id: 'medico', rotulo: 'Médico' },
  { id: 'enfermagem', rotulo: 'Enfermagem' },
  { id: 'recepcao', rotulo: 'Recepção' },
  { id: 'financeiro', rotulo: 'Financeiro' },
];

function acessa(perfil: AppRole, grupo?: AppRole[], item?: AppRole[]) {
  return (!grupo || grupo.includes(perfil)) && (!item || item.includes(perfil));
}

export function PerfisDeAcesso() {
  const grupos = menuGroups
    .filter(grupo => !grupo.superAdminOnly)
    .map(grupo => ({ ...grupo, items: grupo.items.filter(item => !item.superAdminOnly && !item.external) }))
    .filter(grupo => grupo.items.length > 0);

  return (
    <section aria-labelledby="perfis-acesso-titulo" className="space-y-3">
      <div>
        <h2 id="perfis-acesso-titulo" className="text-lg font-semibold tracking-tight">Perfis de acesso</h2>
        <p className="text-sm text-muted-foreground">
          O que cada função vê no menu. Para mudar o acesso de alguém, altere a função no cadastro do funcionário.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Módulos liberados por perfil</caption>
          <thead className="sticky top-0 bg-secondary">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Módulo</th>
              {PERFIS.map(perfil => (
                <th key={perfil.id} scope="col" className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{perfil.rotulo}</th>
              ))}
            </tr>
          </thead>
          {grupos.map(grupo => (
            <tbody key={grupo.label}>
              <tr className="border-t border-border bg-muted/40">
                <th scope="rowgroup" colSpan={PERFIS.length + 1} className="px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{grupo.label}</th>
              </tr>
              {grupo.items.map(item => (
                <tr key={`${grupo.label}-${item.href}`} className="border-t border-border/60">
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    {item.label}
                    {item.planFeature && <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[10px] font-normal">Depende do plano</Badge>}
                  </th>
                  {PERFIS.map(perfil => {
                    const liberado = acessa(perfil.id, grupo.roles, item.roles);
                    return (
                      <td key={perfil.id} className="px-2 py-2 text-center">
                        {liberado
                          ? <Check aria-label={`${perfil.rotulo}: acessa`} className="mx-auto h-4 w-4 text-foreground" />
                          : <Minus aria-label={`${perfil.rotulo}: sem acesso`} className="mx-auto h-4 w-4 text-muted-foreground/50" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
