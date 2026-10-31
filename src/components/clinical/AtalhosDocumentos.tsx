import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, FileCheck, FlaskConical, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Atalhos do protótipo aprovado em 30/10/2026: a tecla / leva aos documentos do atendimento.
interface Props {
  pacienteId: string;
  onReceita: () => void;
}

function digitando(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

export function AtalhosDocumentos({ pacienteId, onReceita }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const primeiro = useRef<HTMLButtonElement>(null);
  const paciente = encodeURIComponent(pacienteId);
  const abrir = (destino: string) => navigate(destino, { state: { returnTo: `${location.pathname}${location.search}` } });

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
      <Button ref={primeiro} type="button" variant="outline" className={botao} onClick={onReceita}>
        <Pill aria-hidden="true" className="h-3.5 w-3.5" /> Receita
      </Button>
      <Button type="button" variant="outline" className={botao} onClick={() => abrir(`/exames/nova?paciente=${paciente}`)}>
        <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" /> Pedido de exame
      </Button>
      <Button type="button" variant="outline" className={botao} onClick={() => abrir(`/documentos-clinicos/novo-atestado?paciente=${paciente}`)}>
        <FileCheck aria-hidden="true" className="h-3.5 w-3.5" /> Atestado
      </Button>
      <Button type="button" variant="outline" className={botao} onClick={() => abrir(`/documentos-clinicos/novo-encaminhamento?paciente=${paciente}`)}>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /> Encaminhamento
      </Button>
    </div>
  );
}
