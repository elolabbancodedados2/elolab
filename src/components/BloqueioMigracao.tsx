import { DatabaseBackup } from 'lucide-react';
import logoIcon from '@/assets/logo-elolab-icon.png';

export function BloqueioMigracao() {
  return (
    <main
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="migracao-titulo"
      aria-describedby="migracao-mensagem"
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-background p-6"
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <img src={logoIcon} alt="EloLab" className="h-10 w-10 object-contain" />
        </div>
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-warning/15">
          <DatabaseBackup className="h-5 w-5 animate-pulse text-warning" />
        </div>
        <h1 id="migracao-titulo" className="mb-3 text-2xl font-bold tracking-tight">
          Estamos fazendo a migração para SQL
        </h1>
        <p id="migracao-mensagem" className="text-sm leading-relaxed text-muted-foreground">
          A plataforma está temporariamente indisponível enquanto os dados são atualizados para a nova versão.
        </p>
        <p className="mt-8 text-xs text-muted-foreground/70">
          Não feche esta página. O acesso será restabelecido após a conclusão da migração.
        </p>
      </div>
    </main>
  );
}
