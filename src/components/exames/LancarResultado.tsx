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
import { useEffect, useState } from 'react';
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
import { mensagemDeErro } from '@/lib/erros';

interface Props {
  exame: {
    id: string;
    tipo_exame: string;
    paciente_id: string;
    resultado?: string | null;
    arquivo_resultado?: string | null;
    updated_at?: string | null;
  } | null;
  onFechar: () => void;
  /** Chamado depois de salvar, para a tela seguir com o fluxo de laudo. */
  aoSalvar?: (exameId: string) => void | boolean | Promise<void | boolean>;
}

/** 10 MB é o teto do bucket de anexos médicos. */
const TETO_BYTES = 10 * 1024 * 1024;
const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXTENSOES_PERMITIDAS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif']);
const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

export function LancarResultado({ exame, onFechar, aoSalvar }: Props) {
  const { profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const exameId = exame?.id ?? null;
  const resultadoSalvo = exame?.resultado ?? '';

  // Cada abertura começa com o que está salvo no banco. Fechar sem salvar e
  // reabrir o mesmo exame não pode reaproveitar texto descartado no diálogo.
  useEffect(() => {
    setTexto(resultadoSalvo);
    setArquivo(null);
  }, [exameId, resultadoSalvo]);

  async function salvar() {
    if (!exame) return;
    if (salvando) return;
    if (!profile?.clinica_id) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    if (!texto.trim() && !arquivo && !exame.arquivo_resultado) {
      toast.error('Escreva o resultado ou anexe o laudo', {
        description: 'Sem um dos dois, o paciente é avisado e não encontra nada.',
      });
      return;
    }

    setSalvando(true);
    let arquivoNovo: string | null = null;
    let resultadoPersistido = false;
    try {
      let caminhoArquivo = exame.arquivo_resultado ?? null;

      if (arquivo) {
        if (arquivo.size > TETO_BYTES) {
          throw new Error(`O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB. O limite é 10 MB.`);
        }
        const extensaoOriginal = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
        if (!EXTENSOES_PERMITIDAS.has(extensaoOriginal) || (arquivo.type && !TIPOS_PERMITIDOS.has(arquivo.type))) {
          throw new Error('Use um arquivo PDF ou uma imagem JPG, PNG, WebP ou GIF.');
        }
        // Caminho por clínica e paciente: é o que as políticas do bucket usam
        // para não deixar uma clínica alcançar o anexo da outra.
        const extensao = extensaoOriginal;
        const caminho = `${profile.clinica_id}/${exame.paciente_id}/${exame.id}-${Date.now()}.${extensao}`;

        const { error: erroUpload } = await supabase.storage
          .from('medical-attachments')
          .upload(caminho, arquivo, { contentType: arquivo.type || MIME_POR_EXTENSAO[extensao], upsert: false });
        if (erroUpload) throw new Error(`Não consegui subir o arquivo: ${erroUpload.message}`);

        arquivoNovo = caminho;
        caminhoArquivo = caminho;
      }

      let atualizarExame = supabase
        .from('exames')
        .update({
          resultado: texto.trim() || null,
          arquivo_resultado: caminhoArquivo,
        })
        .eq('id', exame.id)
        .eq('clinica_id', profile.clinica_id);
      // O diálogo pode ficar aberto enquanto outro operador registra ou troca
      // o laudo. Só grava se a linha ainda tiver a versão que foi aberta.
      atualizarExame = exame.updated_at
        ? atualizarExame.eq('updated_at', exame.updated_at)
        : atualizarExame.is('updated_at', null);
      const { data, error } = await atualizarExame.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este exame foi alterado ou saiu do seu acesso enquanto o formulário estava aberto. Não sobrescrevi os dados. Atualize a lista, confira o resultado atual e tente novamente.');
      resultadoPersistido = true;

      // Ao trocar o laudo, o caminho anterior deixa de ser referenciado pelo
      // exame. Limpa-o só depois da confirmação do banco; uma falha no Storage
      // não invalida o resultado novo que já foi salvo.
      if (arquivoNovo && exame.arquivo_resultado && exame.arquivo_resultado !== arquivoNovo) {
        try {
          const { error: erroRemocao } = await supabase.storage
            .from('medical-attachments')
            .remove([exame.arquivo_resultado]);
          if (erroRemocao) throw erroRemocao;
        } catch (erroRemocao) {
          toast.warning('O novo laudo foi salvo, mas o arquivo anterior não pôde ser removido.', {
            description: mensagemDeErro(erroRemocao),
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['exames'] });
      toast.success('Resultado lançado');

      // O laudo e o aviso ao paciente são passo seguinte, e quem sabe fazê-lo
      // é a tela de exames — que já tem a automação ligada.
      let avancouParaLaudo = true;
      let erroAoAvancar: string | null = null;
      try {
        avancouParaLaudo = (await aoSalvar?.(exame.id)) !== false;
      } catch (erroAutomacao) {
        avancouParaLaudo = false;
        erroAoAvancar = mensagemDeErro(erroAutomacao);
      }
      if (!avancouParaLaudo) {
        toast.warning('O resultado foi salvo, mas o laudo ainda não foi liberado.', {
          description: [erroAoAvancar, 'O exame continua na lista. Use a ação de avanço para tentar novamente.'].filter(Boolean).join(' '),
        });
      }
      onFechar();
    } catch (e: unknown) {
      if (arquivoNovo && !resultadoPersistido) {
        try {
          const { error: erroLimpeza } = await supabase.storage
            .from('medical-attachments')
            .remove([arquivoNovo]);
          if (erroLimpeza) throw erroLimpeza;
        } catch (erroLimpeza) {
          toast.warning('O resultado não foi salvo e o arquivo temporário não pôde ser removido.', {
            description: mensagemDeErro(erroLimpeza),
          });
        }
      }
      toast.error('Não foi possível lançar o resultado', { description: mensagemDeErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!exame} onOpenChange={a => { if (!a && !salvando) onFechar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resultado — {exame?.tipo_exame}</DialogTitle>
          <DialogDescription>
            Escreva o resultado, anexe o laudo, ou os dois. Ao salvar, o exame
            passa a "laudo disponível" e o paciente é avisado.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={salvando} className="space-y-3">
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
        </fieldset>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Lançar resultado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
