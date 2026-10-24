import { CircleHelp, ExternalLink, Lightbulb } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getContextualHelp, getVisibleHelpLinks, HELP_TERMS, type HelpTermKey } from '@/lib/contextualHelp';

/** Explicação curta de um termo, ao lado do rótulo ou título a que se refere. */
export function FieldHelp({ term }: { term: HelpTermKey }) {
  const entry: { title: string; summary: string; items?: string[] } = HELP_TERMS[term];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`O que é ${entry.title}?`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm font-normal normal-case tracking-normal">
        <p className="font-semibold text-foreground">{entry.title}</p>
        <p className="mt-1 leading-6 text-muted-foreground">{entry.summary}</p>
        {entry.items && (
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {entry.items.map(item => <li key={item}>{item}</li>)}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ContextualHelp() {
  const { pathname } = useLocation();
  const { profile } = useSupabaseAuth();
  const help = getContextualHelp(pathname);
  const roles = profile?.roles ?? [];
  const roleTip = roles.map(role => help.roleTips?.[role]).find(Boolean);
  const links = getVisibleHelpLinks(help, roles);

  return (
    <Sheet>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-xl text-muted-foreground hover:bg-accent/60 hover:text-foreground sm:h-9 sm:w-9"
              aria-label="Abrir ajuda desta tela"
            >
              <CircleHelp className="h-[18px] w-[18px]" aria-hidden="true" />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Ajuda desta tela</TooltipContent>
      </Tooltip>

      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md" aria-describedby="contextual-help-description">
        <SheetHeader className="border-b px-5 pb-5 pt-6 text-left sm:px-6">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <CircleHelp className="h-5 w-5" />
          </div>
          <SheetTitle className="text-xl">{help.title}</SheetTitle>
          <SheetDescription id="contextual-help-description" className="text-sm leading-6">
            {help.summary}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-5 py-6 sm:px-6">
            <section aria-labelledby="contextual-help-steps">
              <h2 id="contextual-help-steps" className="mb-3 text-sm font-semibold text-foreground">Como usar</h2>
              <ol className="space-y-3">
                {help.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {roleTip && (
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-4" aria-labelledby="contextual-help-role-tip">
                <div className="flex gap-3">
                  <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h2 id="contextual-help-role-tip" className="text-sm font-semibold text-foreground">Dica para sua função</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{roleTip}</p>
                  </div>
                </div>
              </section>
            )}

            {links.length > 0 && (
              <section aria-labelledby="contextual-help-links">
                <h2 id="contextual-help-links" className="mb-2 text-sm font-semibold text-foreground">Próximos passos</h2>
                <div className="grid gap-2">
                  {links.map(link => (
                    <Button key={link.href} variant="outline" className="h-11 justify-between whitespace-normal text-left" asChild>
                      <Link to={link.href}>
                        {link.label}
                        <ExternalLink className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
                      </Link>
                    </Button>
                  ))}
                </div>
              </section>
            )}

            <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
              A ajuda explica o uso do sistema. Para decisões clínicas ou dúvidas sobre um atendimento, siga os protocolos da sua clínica.
            </p>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
