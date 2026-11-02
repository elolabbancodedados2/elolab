import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirmacao } from '@/hooks/useConfirmacao';
import { cn } from '@/lib/utils';

/** Tipos mínimos da Web Speech API (não fazem parte do lib.dom do TypeScript). */
interface ResultadoReconhecimento { isFinal: boolean; 0: { transcript: string } }
interface EventoReconhecimento { resultIndex: number; results: ArrayLike<ResultadoReconhecimento> }
interface Reconhecimento {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((evento: EventoReconhecimento) => void) | null;
  onerror: ((evento: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type ConstrutorReconhecimento = new () => Reconhecimento;

function construtorReconhecimento(): ConstrutorReconhecimento | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstrutorReconhecimento; webkitSpeechRecognition?: ConstrutorReconhecimento };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// O aviso de privacidade é aceito uma vez por sessão da aba, sem gravar nada
// no navegador.
let avisoDitadoAceito = false;

/** Junta o texto ditado ao que já está no campo, com espaço entre os dois. */
export function juntarTextoDitado(atual: string, ditado: string): string {
  const novo = ditado.trim();
  if (!novo) return atual;
  if (!atual.trim()) return novo;
  return /\s$/.test(atual) ? `${atual}${novo}` : `${atual} ${novo}`;
}

interface Props {
  /** Nome do campo, para o rótulo acessível ("Ditar queixa principal"). */
  campo: string;
  onTexto: (texto: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Ditado por voz (pt-BR) para as caixas de texto da evolução. Só aparece
 * quando o navegador oferece reconhecimento de voz.
 */
export function BotaoDitado({ campo, onTexto, disabled = false, className }: Props) {
  const [ouvindo, setOuvindo] = useState(false);
  const reconhecimentoRef = useRef<Reconhecimento | null>(null);
  const onTextoRef = useRef(onTexto);
  onTextoRef.current = onTexto;
  const [confirmar, dialogo] = useConfirmacao();
  const Construtor = construtorReconhecimento();

  useEffect(() => () => reconhecimentoRef.current?.stop(), []);
  useEffect(() => { if (disabled) reconhecimentoRef.current?.stop(); }, [disabled]);

  if (!Construtor) return null;

  const alternar = async () => {
    if (ouvindo) {
      reconhecimentoRef.current?.stop();
      return;
    }
    if (!avisoDitadoAceito) {
      const aceito = await confirmar({
        titulo: 'Usar ditado por voz?',
        descricao: 'O reconhecimento de voz é feito pelo navegador e pode enviar o áudio ao fornecedor do navegador para transcrição. Evite ditar dados que identifiquem o paciente além do necessário. Revise o texto antes de salvar.',
        confirmar: 'Ativar ditado',
        variante: 'default',
      });
      if (!aceito) return;
      avisoDitadoAceito = true;
    }
    const reconhecimento = new Construtor();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = true;
    reconhecimento.interimResults = false;
    reconhecimento.onresult = (evento) => {
      let texto = '';
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i];
        if (resultado.isFinal) texto += resultado[0].transcript;
      }
      if (texto.trim()) onTextoRef.current(texto);
    };
    reconhecimento.onerror = (evento) => {
      if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed') {
        toast.error('Microfone bloqueado', { description: 'Permita o uso do microfone para este site e tente novamente.' });
      } else if (evento.error && evento.error !== 'aborted' && evento.error !== 'no-speech') {
        toast.error('O ditado foi interrompido.', { description: 'Tente novamente ou digite o texto.' });
      }
    };
    reconhecimento.onend = () => {
      setOuvindo(false);
      reconhecimentoRef.current = null;
    };
    try {
      reconhecimento.start();
      reconhecimentoRef.current = reconhecimento;
      setOuvindo(true);
    } catch {
      toast.error('Não foi possível iniciar o ditado.');
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={ouvindo ? 'default' : 'ghost'}
        size="icon"
        className={cn('h-11 w-11 shrink-0 rounded-full sm:h-9 sm:w-9', className)}
        onClick={() => { void alternar(); }}
        disabled={disabled}
        aria-pressed={ouvindo}
        aria-label={ouvindo ? `Parar ditado de ${campo}` : `Ditar ${campo}`}
        title={ouvindo ? 'Parar ditado' : 'Ditar por voz'}
      >
        {ouvindo ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
      {dialogo}
    </>
  );
}
