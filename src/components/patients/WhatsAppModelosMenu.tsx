import { MessageCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MODELOS_WHATSAPP, linkModeloWhatsApp, type DadosMensagemPaciente } from '@/lib/modelosWhatsAppPaciente';
import { linkWhatsApp } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';

interface Props {
  paciente: DadosMensagemPaciente & { telefone?: string | null };
  className?: string;
  /** Texto do botão; o nome acessível sempre cita o paciente. */
  rotulo?: string;
}

/** Botão "WhatsApp" com modelos de mensagem. Some quando o telefone não serve. */
export function WhatsAppModelosMenu({ paciente, className, rotulo = 'WhatsApp' }: Props) {
  if (!linkWhatsApp(paciente.telefone, 'x')) return null;
  const nome = paciente.nome_social || paciente.nome || 'paciente';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className={cn('h-11 gap-1.5', className)} aria-label={`Chamar ${nome} no WhatsApp`}>
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          {rotulo}
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Escolha um modelo</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODELOS_WHATSAPP.map(modelo => {
          const link = linkModeloWhatsApp(paciente.telefone, modelo.id, paciente);
          return link ? (
            <DropdownMenuItem key={modelo.id} asChild className="min-h-11 cursor-pointer">
              <a href={link} target="_blank" rel="noopener noreferrer">{modelo.rotulo}</a>
            </DropdownMenuItem>
          ) : null;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
