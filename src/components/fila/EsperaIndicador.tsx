import { AlertTriangle, Hourglass, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatarEspera, minutosDeEspera, nivelEspera, type NivelEspera } from '@/lib/filaEspera';

const ESTILO: Record<NivelEspera, { icon: typeof Timer; cor: string }> = {
  sem_registro: { icon: Timer, cor: 'text-muted-foreground' },
  no_prazo: { icon: Timer, cor: 'text-success' },
  atencao: { icon: Hourglass, cor: 'text-warning-foreground' },
  atrasado: { icon: AlertTriangle, cor: 'text-destructive font-semibold' },
};

/** Tempo de espera com ícone e rótulo por nível — a cor nunca é o único sinal. */
export function EsperaIndicador({ desde, agora, className }: { desde: string | null | undefined; agora?: number; className?: string }) {
  const minutos = minutosDeEspera(desde, agora);
  const { nivel, rotulo } = nivelEspera(minutos);
  const { icon: Icon, cor } = ESTILO[nivel];
  const tempo = formatarEspera(minutos);
  const destacar = nivel === 'atencao' || nivel === 'atrasado';
  return (
    <span
      aria-label={minutos === null ? rotulo : `Espera de ${tempo} · ${rotulo}`}
      title={rotulo}
      className={cn('inline-flex items-center gap-1 tabular-nums', cor, className)}
    >
      <Icon aria-hidden="true" data-nivel={nivel} className="h-3.5 w-3.5 shrink-0" />
      <span>{tempo}</span>
      {destacar && <span>· {rotulo}</span>}
    </span>
  );
}
