import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { classeTextoNivelVital, classificarSinalVital, numeroVital, piorNivelVital } from '@/lib/limiaresVitais';

// Faixa do protótipo aprovado em 30/10/2026: sinais vitais do atendimento sempre à vista no topo.
type Sinais = Partial<Record<string, string | number | null>>;

interface Props {
  sinais: Sinais;
  onAbrir: () => void;
  /** Quando os sinais vêm da triagem e ainda não estão no prontuário, ex.: "Triagem 09:40". */
  origem?: string;
  onUsar?: () => void;
}

function numero(valor: Sinais[string]) {
  return numeroVital(valor);
}

// Vermelho e âmbar só fora da faixa, pelos limiares únicos do app
// (os mesmos do painel de contexto clínico e dos gráficos).
export function FaixaSinaisVitais({ sinais, onAbrir, origem, onUsar }: Props) {
  const pas = numero(sinais.pressao_sistolica);
  const pad = numero(sinais.pressao_diastolica);
  const fc = numero(sinais.frequencia_cardiaca);
  const temp = numero(sinais.temperatura);
  const sat = numero(sinais.saturacao);
  const peso = numero(sinais.peso);

  const itens = [
    pas !== null && { rotulo: 'PA', valor: `${pas}/${pad ?? '—'}`, unidade: 'mmHg', classe: classeTextoNivelVital(piorNivelVital(classificarSinalVital('pressao_sistolica', pas), classificarSinalVital('pressao_diastolica', pad))) },
    fc !== null && { rotulo: 'FC', valor: String(fc), unidade: 'bpm', classe: classeTextoNivelVital(classificarSinalVital('frequencia_cardiaca', fc)) },
    temp !== null && { rotulo: 'Temp', valor: String(temp).replace('.', ','), unidade: '°C', classe: classeTextoNivelVital(classificarSinalVital('temperatura', temp)) },
    sat !== null && { rotulo: 'SpO₂', valor: String(sat), unidade: '%', classe: classeTextoNivelVital(classificarSinalVital('saturacao', sat)) },
    peso !== null && { rotulo: 'Peso', valor: String(peso).replace('.', ','), unidade: 'kg', classe: 'text-foreground' },
  ].filter(Boolean) as Array<{ rotulo: string; valor: string; unidade: string; classe: string }>;

  const faixa = (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={itens.length ? `${origem ? `${origem}: ` : 'Sinais vitais: '}${itens.map(item => `${item.rotulo} ${item.valor} ${item.unidade}`).join(', ')}. Abrir exame físico` : 'Sinais vitais não registrados. Registrar no exame físico'}
      className="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Activity aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      {origem && itens.length > 0 && <span className="font-medium text-muted-foreground">{origem}</span>}
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

  if (!origem || !onUsar || itens.length === 0) return faixa;

  return (
    <div className="flex min-w-0 flex-shrink-0 flex-wrap items-center gap-1.5">
      {faixa}
      <button
        type="button"
        onClick={onUsar}
        className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Usar no prontuário
      </button>
    </div>
  );
}
