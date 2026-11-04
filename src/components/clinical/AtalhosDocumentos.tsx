import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, FileCheck, FlaskConical, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Atalhos do protótipo aprovado em 30/10/2026: a tecla / leva aos documentos do atendimento.
interface Props {
  pacienteId: string;
  /** Evolução já salva: o pedido de exame nasce ligado a ela. */
  prontuarioId?: string | null;
  /** Atendimento em curso: atestado e encaminhamento ficam ligados a ele. */
  agendamentoId?: string | null;
  onReceita: () => void;
  beforeOpen: () => Promise<string | null | false>;
  onNavigate?: (destino: string, returnTo: string) => void;
}

function digitando(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

export function AtalhosDocumentos({ pacienteId, prontuarioId, agendamentoId, onReceita, beforeOpen, onNavigate }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const primeiro = useRef<HTMLButtonElement>(null);
  const paciente = encodeURIComponent(pacienteId);
  const vinculo = agendamentoId ? `&agendamento=${encodeURIComponent(agendamentoId)}` : '';
  const [salvando, setSalvando] = useState(false);
  const abrindo = useRef(false);
  const abrir = async (tipo: 'receita' | 'exame' | 'atestado' | 'encaminhamento') => {
    if (abrindo.current) return;
    abrindo.current = true;
    setSalvando(true);
    try {
      const salvo = await beforeOpen();
      if (salvo === false) return;
      if (tipo === 'receita') { onReceita(); return; }
      const evolucao = salvo || prontuarioId;
      const linkEvolucao = evolucao ? `&prontuario=${encodeURIComponent(evolucao)}` : '';
      const destino = tipo === 'exame'
        ? `/exames/nova?paciente=${paciente}${vinculo}${linkEvolucao}&voltar=prontuario`
        : `/documentos-clinicos/novo-${tipo}?paciente=${paciente}${vinculo}${tipo === 'encaminhamento' ? linkEvolucao : ''}`;
      const returnParams = new URLSearchParams(location.search);
      if (evolucao) { returnParams.set('prontuario', evolucao); returnParams.delete('nova'); }
      const returnTo = `${location.pathname}?${returnParams}`;
      if (onNavigate) onNavigate(destino, returnTo);
      else navigate(destino, { state: { returnTo } });
    } finally {
      abrindo.current = false;
      setSalvando(false);
    }
  };

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey || digitando(evento.target)) return;
      evento.preventDefault();
      primeiro.current?.focus();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const botao = 'h-8 gap-1.5 rounded-lg px-2.5 text-xs';
  return (
    <div role="group" aria-label="Inserir documento no atendimento" className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">
        Inserir <kbd className="rounded border border-border bg-card px-1 font-sans text-[10px] font-semibold text-foreground">/</kbd>
      </span>
      <Button ref={primeiro} type="button" variant="outline" className={botao} disabled={salvando} onClick={() => void abrir('receita')}>
        <Pill aria-hidden="true" className="h-3.5 w-3.5" /> Receita
      </Button>
      <Button type="button" variant="outline" className={botao} disabled={salvando} onClick={() => void abrir('exame')}>
        <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" /> Pedido de exame
      </Button>
      <Button type="button" variant="outline" className={botao} disabled={salvando} onClick={() => void abrir('atestado')}>
        <FileCheck aria-hidden="true" className="h-3.5 w-3.5" /> Atestado
      </Button>
      <Button type="button" variant="outline" className={botao} disabled={salvando} onClick={() => void abrir('encaminhamento')}>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /> Encaminhamento
      </Button>
    </div>
  );
}
