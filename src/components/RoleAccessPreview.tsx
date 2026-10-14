import { getRoleAccessPreview } from '@/lib/roleAccessPreview';
import type { AppRole } from '@/contexts/SupabaseAuthContext';

export function RoleAccessPreview({ roles }: { roles: AppRole[] }) {
  const areas = getRoleAccessPreview(roles);
  const screenCount = areas.reduce((total, area) => total + area.items.length, 0);

  return (
    <section role="region" aria-label="Prévia de acesso" aria-live="polite" className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <h3 className="text-sm font-semibold text-foreground">Prévia de acesso</h3>
      {roles.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Selecione um papel para ver quais telas ficarão disponíveis no menu.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {screenCount} telas em {areas.length} áreas com esta combinação. O acesso aos dados continua sujeito às permissões da clínica.
          </p>
          <details className="mt-2 text-xs">
            <summary className="min-h-11 cursor-pointer content-center font-medium text-primary">Ver telas por área</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {areas.map((area) => (
                <div key={area.name}>
                  <h4 className="font-semibold text-foreground">{area.name}</h4>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                    {area.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
