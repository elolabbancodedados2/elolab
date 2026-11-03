import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

export interface AcaoRecepcao {
  id: string;
  label: string;
  run: () => void;
}

export function AcoesRecepcao({ acoes, disabled }: { acoes: AcaoRecepcao[]; disabled: boolean }) {
  const [principal, ...secundarias] = acoes;
  if (!principal) return null;
  return <div className="flex flex-wrap items-center gap-1.5">
    <Button type="button" size="sm" onClick={principal.run} disabled={disabled}>{principal.label}</Button>
    {secundarias.length > 0 && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="outline" aria-label="Mais ações do paciente" disabled={disabled}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">{secundarias.map(acao => <DropdownMenuItem key={acao.id} onSelect={acao.run}>{acao.label}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}
