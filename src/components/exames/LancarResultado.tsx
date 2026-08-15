/**
 * Lançar o resultado de um exame.
 *
 * Era o degrau que faltava no meio da escada. O banco tinha o campo
 * `resultado`, a automação sabia vincular o laudo ao prontuário e avisar o
 * paciente — e não existia tela para digitar o resultado. Consequência medida
 * em produção: 285 exames marcados como realizados, NENHUM com resultado, e
 * três "laudo disponível" vazios.
 *
 * Aceita texto, arquivo, ou os dois: laboratório externo manda PDF, exame
 * feito na casa costuma ser descrito à mão, e ultrassom vem das duas formas.
 * Exigir um formato só empurraria metade dos casos de volta para o papel.
 *
 * Ao salvar, o exame vai para "laudo disponível" — que é o estado que dispara
 * o aviso ao paciente e a vinculação ao prontuário.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

interface Props {
  exame: {
    id: string;
    tipo_exame: string;
    paciente_id: string;
    resultado?: string | null;
    arquivo_resultado?: string | null;
  } | null;
  onFechar: () => void;
  /** Chamado depois de salvar, para a tela seguir com o fluxo de laudo. */
  aoSalvar?: (exameId: string) => void | Promise<void>;
}

/** 10 MB é o teto do bucket de anexos médicos. */
const TETO_BYTES = 10 * 1024 * 1024;

export function LancarResultado({ exame, onFechar, aoSalvar }: Props) {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  // O conteúdo é remontado a cada abertura; sem isto o resultado de um exame
  // apareceria ao abrir o próximo.
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  if (exame && exame.id !== ultimoId) {
    setUltimoId(exame.id);
    setTexto(exame.resultado ?? '');
    setArquivo(null);
  }

  async function salvar() {
    if (!exame) return;
    if (!texto.trim() && !arquivo && !exame.arquivo_resultado) {
      toast.error('Escreva o resultado ou anexe o laudo', {
        description: 'Sem um dos dois, o paciente é avisado e não encontra nada.',
      });
      return;
    }

    setSalvando(true);
    try {
      let caminhoArquivo = exame.arquivo_resultado ?? null;

      if (arquivo) {
        if (arquivo.size > TETO_BYTES) {
          throw new Error(`O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB. O limite é 10 MB.`);
        }
        // Caminho por clínica e paciente: é o que as políticas do bucket usam
        // para não deixar uma clínica alcançar o anexo da outra.
        const extensao = arquivo.name.split('.').pop() ?? 'bin';
        const caminho = `${profile?.clinica_id}/${exame.paciente_id}/${exame.id}-${Date.now()}.${extensao}`;

        const { error: erroUpload } = await supabase.storage
          .from('medical-attachments')
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
        if (erroUpload) throw new Error(`Não consegui subir o arquivo: ${erroUpload.message}`);

        caminhoArquivo = caminho;
      }

      const { error } = await supabase
        .from('exames')
        .update({
          resultado: texto.trim() || null,
          arquivo_resultado: caminhoArquivo,
        } as any)
        .eq('id', exame.id)
        .select('id')
        .single();
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['exames'] });
      toast.success('Resultado lançado');

      // O laudo e o aviso ao paciente são passo seguinte, e quem sabe fazê-lo
      // é a tela de exames — que já tem a automação ligada.
      await aoSalvar?.(exame.id);
      onFechar();
    } catch (e: any) {
      toast.error('Não foi possível lançar o resultado', { description: e?.message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!exame} onOpenChange={a => !a && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resultado — {exame?.tipo_exame}</DialogTitle>
          <DialogDescription>
            Escreva o resultado, anexe o laudo, ou os dois. Ao salvar, o exame
            passa a "laudo disponível" e o paciente é avisado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="resultado-texto">Resultado</Label>
            <Textarea
              id="resultado-texto" rows={6} value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex.: Hemácias 4,8 milhões/mm³. Série branca sem alterações. Plaquetas 250 mil."
            />
          </div>

          <div className="space-y-1">
            <Label>Laudo em arquivo (opcional)</Label>
            {arquivo ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {(arquivo.size / 1024).toFixed(0)} KB
                </span>
                <Button
                  variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => setArquivo(null)} aria-label="Remover arquivo"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40">
                <Upload className="h-3.5 w-3.5" />
                {exame?.arquivo_resultado ? 'Trocar o laudo anexado' : 'Anexar PDF ou imagem (até 10 MB)'}
                <input
                  type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={e => { setArquivo(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Lançar resultado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
