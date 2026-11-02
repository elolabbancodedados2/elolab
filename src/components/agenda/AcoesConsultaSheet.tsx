import { useState } from 'react';
import { MoreHorizontal } from '@/components/icons/elolabIcons';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAcoesConsulta } from './useAcoesConsulta';

interface Props {
  agendamento: any;
  onAbrir: () => void;
  onNovaConsulta?: (initial: any) => void;
  onRemarcar?: (agendamento: any) => void;
}

/** Ações da consulta no celular, onde não há botão direito: uma folha que sobe da base. */
export function AcoesConsultaSheet({ agendamento, onAbrir, onNovaConsulta, onRemarcar }: Props) {
  const [aberta, setAberta] = useState(false);
  const fechar = (acao: () => void) => () => { setAberta(false); acao(); };
  const { acoes, dialogos } = useAcoesConsulta(agendamento, { onAbrir, onNovaConsulta, onRemarcar });
  const paciente = agendamento.pacientes?.nome_social || agendamento.pacientes?.nome || 'Paciente';
  const hora = String(agendamento.hora_inicio || '').slice(0, 5);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Ações da consulta de ${paciente} às ${hora}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      <Sheet open={aberta} onOpenChange={setAberta}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl p-4">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>{paciente}</SheetTitle>
            <SheetDescription>Consulta às {hora}</SheetDescription>
          </SheetHeader>
          <ul className="mt-3 divide-y divide-border">
            {acoes.map(acao => {
              const Icone = acao.icon;
              return (
                <li key={acao.id}>
                  <button
                    type="button"
                    disabled={acao.disabled}
                    title={acao.title}
                    onClick={fechar(acao.onSelect)}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 px-1 text-left text-sm font-medium disabled:opacity-40',
                      acao.tone === 'destructive' && 'text-destructive',
                      acao.tone === 'warning' && 'text-warning-foreground',
                    )}
                  >
                    {Icone ? <Icone className="h-4 w-4 shrink-0" /> : <span className="w-4 shrink-0" aria-hidden="true" />}
                    <span className="flex-1">{acao.label}</span>
                    {acao.hint && <span className="text-xs font-normal text-muted-foreground">{acao.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
      {dialogos}
    </>
  );
}
