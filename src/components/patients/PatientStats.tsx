interface PatientStatsProps {
  total: number | string;
  comConvenio: number | string;
  menores: number | string;
  comAlergias: number | string;
}

export function PatientStats({ total, comConvenio, menores, comAlergias }: PatientStatsProps) {
  const metrics = [
    { label: 'Total de pacientes', value: total },
    { label: 'Com convênio', value: comConvenio },
    { label: 'Menores', value: menores },
    { label: 'Com alergias', value: comAlergias },
  ];

  return (
    <section aria-label="Resumo dos pacientes" className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-4">
        {metrics.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
