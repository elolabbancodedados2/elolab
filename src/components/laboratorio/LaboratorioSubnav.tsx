import { Activity, ClipboardList, FileCheck2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const destinos = [
  { to: '/laboratorio', label: 'Visão geral', icon: Activity, end: true },
  { to: '/laudos-lab', label: 'Laudos', icon: FileCheck2, end: true },
];

/** Navegação curta que mantém as três etapas laboratoriais no mesmo contexto. */
export function LaboratorioSubnav() {
  const { hasAnyRole } = useSupabaseAuth();
  const destinosVisiveis = hasAnyRole(['enfermagem'])
    ? [destinos[0], { to: '/mapa-coleta', label: 'Mapa de coleta', icon: ClipboardList, end: true }, destinos[1]]
    : destinos;

  return (
    <nav aria-label="Etapas do laboratório" className="-mt-2 flex gap-1 overflow-x-auto border-b border-border/70">
      {destinosVisiveis.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            isActive
              ? 'border-primary text-primary'
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
