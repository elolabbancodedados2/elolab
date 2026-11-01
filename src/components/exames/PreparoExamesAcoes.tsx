import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { escapeHtml } from '@/lib/html';
import { linkWhatsApp } from '@/lib/whatsapp';
import { mensagemPreparoWhatsApp, preparosDosExames } from '@/lib/examesWorkflow';

interface PreparoExamesAcoesProps {
  exames: string[];
  pacienteNome: string;
  telefone?: string | null;
}

/**
 * Envia ou imprime o preparo configurado no catálogo para os exames pedidos.
 * Antes o preparo só aparecia no formulário da guia e não chegava ao paciente.
 */
export function PreparoExamesAcoes({ exames, pacienteNome, telefone }: PreparoExamesAcoesProps) {
  const { profile } = useSupabaseAuth();
  const catalogoQuery = useQuery({
    queryKey: ['tipo_exames_catalog_preparo', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipo_exames_catalog')
        .select('nome, preparo')
        .eq('clinica_id', profile!.clinica_id!)
        .not('preparo', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (catalogoQuery.isLoading) return <p role="status" className="text-xs text-muted-foreground">Conferindo o preparo dos exames…</p>;
  if (catalogoQuery.isError) return <p className="text-xs text-muted-foreground">Não foi possível conferir o preparo no catálogo.</p>;
  const preparos = preparosDosExames(exames, catalogoQuery.data ?? []);
  if (preparos.length === 0) return <p className="text-xs text-muted-foreground">Nenhum preparo configurado no catálogo para estes exames.</p>;

  const whatsapp = linkWhatsApp(telefone, mensagemPreparoWhatsApp(pacienteNome, preparos));

  const imprimir = () => {
    const janela = window.open('', '_blank');
    if (!janela) { toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para imprimir o preparo.'); return; }
    const itens = preparos.map(item => `<li><strong>${escapeHtml(item.exame)}</strong><br>${escapeHtml(item.preparo)}</li>`).join('');
    janela.document.write(`<html><head><meta charset="utf-8"><title>Preparo dos exames</title><style>body{font-family:Arial,sans-serif;font-size:14px;margin:24px;color:#111}h1{font-size:18px}li{margin-bottom:12px}@media print{.no-print{display:none}}</style></head><body><button class="no-print" id="imprimir-preparo">Imprimir</button><h1>Preparo dos exames</h1><p>Paciente: ${escapeHtml(pacienteNome)}</p><ul>${itens}</ul></body></html>`);
    janela.document.close();
    janela.document.getElementById('imprimir-preparo')?.addEventListener('click', () => janela.print());
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-sm">
        {preparos.map(item => <li key={item.exame}><span className="font-medium">{item.exame}:</span> {item.preparo}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        {whatsapp ? (
          <Button asChild variant="outline" size="sm" className="min-h-11 gap-1.5 rounded-full">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" className="h-4 w-4" />Enviar preparo por WhatsApp</a>
          </Button>
        ) : <span className="self-center text-xs text-muted-foreground">Sem telefone cadastrado para enviar pelo WhatsApp.</span>}
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 rounded-full" onClick={imprimir}>
          <Printer aria-hidden="true" className="h-4 w-4" />Imprimir preparo
        </Button>
      </div>
    </div>
  );
}
