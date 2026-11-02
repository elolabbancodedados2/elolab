import { Activity, ClipboardList, ExternalLink, FileCheck2, TestTube } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSupabaseAuth, type AppRole as Papel } from '@/contexts/SupabaseAuthContext';

/** Mesmos papéis das rotas em App.tsx: o atalho só aparece para quem pode abrir a tela. */
const DESTINOS: Array<{ to: string; label: string; icon: typeof Activity; papeis: Papel[] }> = [
  { to: '/laboratorio', label: 'Visão geral', icon: Activity, papeis: ['admin', 'medico', 'enfermagem'] },
  { to: '/mapa-coleta', label: 'Mapa de coleta', icon: ClipboardList, papeis: ['admin', 'enfermagem'] },
  { to: '/laudos-lab', label: 'Laudos', icon: FileCheck2, papeis: ['admin', 'medico', 'enfermagem'] },
  { to: '/guias-externas', label: 'Guias externas', icon: ExternalLink, papeis: ['admin', 'recepcao', 'enfermagem'] },
  { to: '/exames', label: 'Exames', icon: TestTube, papeis: ['admin', 'medico', 'enfermagem'] },
];

/** Navegação comum das telas do laboratório. */
export function LaboratorioSubnav() {
  const { hasAnyRole } = useSupabaseAuth();
  const destinosVisiveis = DESTINOS.filter(destino => hasAnyRole(destino.papeis));
  if (destinosVisiveis.length < 2) return null;

  return (
    <nav aria-label="Etapas do laboratório" className="-mt-2 flex gap-1 overflow-x-auto border-b border-border/70">
      {destinosVisiveis.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) => cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isActive
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
