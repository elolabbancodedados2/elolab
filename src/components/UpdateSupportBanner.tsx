import { Mail, Phone, RefreshCw } from 'lucide-react';

export function UpdateSupportBanner() {
  return (
    <aside
      role="note"
      aria-label="Aviso de atualização"
      className="border-b border-primary/20 bg-primary/10 px-3 py-2 text-foreground sm:px-4"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-center sm:gap-5">
        <p className="flex items-start gap-2 text-sm leading-relaxed sm:items-center">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" aria-hidden="true" />
          <span>
            Estamos atualizando o EloLab. Se perceber qualquer erro ou instabilidade, avise o suporte:
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-sm sm:pl-0">
          <a
            href="mailto:contato@focussdev.art"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-sm font-medium text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            contato@focussdev.art
          </a>
          <a
            href="tel:+5533984123591"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-sm font-medium text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            (33) 98412-3591
          </a>
        </div>
      </div>
    </aside>
  );
}
