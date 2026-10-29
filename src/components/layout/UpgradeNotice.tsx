import { Info } from 'lucide-react';

/** Aviso temporário da atualização anunciada para 10/11/2026. */
export function UpgradeNotice() {
  return (
    <aside aria-label="Atualização do EloLab" className="shrink-0 border-b border-warning/30 bg-warning/10 px-3 py-2 text-foreground sm:px-5 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] items-start gap-2.5 text-xs leading-relaxed sm:text-sm">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">Atenção: EloLab em atualização. Nova versão no ar em <time dateTime="2026-11-10">10/11</time>.</p>
          <p className="text-xs leading-relaxed">Estamos preparando uma experiência com o objetivo de superar Feegow, Doctoralia e outras soluções.</p>
        </div>
      </div>
    </aside>
  );
}
