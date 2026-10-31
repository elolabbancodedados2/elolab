import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

// Faixa do protótipo aprovado em 30/10/2026: sinais vitais do atendimento sempre à vista no topo.
type Sinais = Partial<Record<string, string | number | null>>;

interface Props {
  sinais: Sinais;
  onAbrir: () => void;
}

function numero(valor: Sinais[string]) {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(valor ?? '').trim() !== '' ? n : null;
}

// Vermelho e âmbar só para valor fora da faixa usual de adulto.
function tom(alerta: boolean, atencao: boolean) {
  return alerta ? 'text-destructive' : atencao ? 'text-warning-foreground' : 'text-foreground';
}

export function FaixaSinaisVitais({ sinais, onAbrir }: Props) {
  const pas = numero(sinais.pressao_sistolica);
  const pad = numero(sinais.pressao_diastolica);
  const fc = numero(sinais.frequencia_cardiaca);
  const temp = numero(sinais.temperatura);
  const sat = numero(sinais.saturacao);
  const peso = numero(sinais.peso);

  const itens = [
    pas !== null && { rotulo: 'PA', valor: `${pas}/${pad ?? '—'}`, unidade: 'mmHg', classe: tom(pas >= 160 || pas < 90, pas >= 140) },
    fc !== null && { rotulo: 'FC', valor: String(fc), unidade: 'bpm', classe: tom(fc > 130 || fc < 45, fc > 100 || fc < 55) },
    temp !== null && { rotulo: 'Temp', valor: String(temp).replace('.', ','), unidade: '°C', classe: tom(temp >= 39, temp >= 37.8) },
    sat !== null && { rotulo: 'SpO₂', valor: String(sat), unidade: '%', classe: tom(sat < 90, sat < 94) },
    peso !== null && { rotulo: 'Peso', valor: String(peso).replace('.', ','), unidade: 'kg', classe: 'text-foreground' },
  ].filter(Boolean) as Array<{ rotulo: string; valor: string; unidade: string; classe: string }>;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={itens.length ? `Sinais vitais: ${itens.map(item => `${item.rotulo} ${item.valor} ${item.unidade}`).join(', ')}. Abrir exame físico` : 'Sinais vitais não registrados. Registrar no exame físico'}
      className="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Activity aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      {itens.length === 0 ? (
        <span className="text-muted-foreground">Sinais vitais não registrados · <span className="font-medium text-foreground underline-offset-2 hover:underline">Registrar</span></span>
      ) : itens.map(item => (
        <span key={item.rotulo} className="whitespace-nowrap">
          <span className="text-muted-foreground">{item.rotulo} </span>
          <span className={cn('font-semibold tabular-nums', item.classe)}>{item.valor}</span>
          <span className="text-muted-foreground"> {item.unidade}</span>
        </span>
      ))}
    </button>
  );
}
