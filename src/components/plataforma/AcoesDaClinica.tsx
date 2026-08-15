/**
 * Arquivar, desarquivar e excluir clínica — no painel da plataforma.
 *
 * Não existia jeito nenhum de limpar a lista pela tela: das 12 clínicas, 3 têm
 * operação e o resto é cadastro de teste que nunca andou. Sem isso, a única
 * saída é mexer no banco.
 *
 * São dois verbos, de propósito:
 *
 *   ARQUIVAR — some da lista, guarda quem/quando/por quê, e volta quando
 *              quiser. É o que serve para cliente que saiu.
 *   EXCLUIR  — só quando a clínica está VAZIA. Clínica com paciente tem
 *              prontuário, e prontuário não se apaga por conveniência: a CFM
 *              1.821/07 manda guardar 20 anos. O banco recusa; a tela nem
 *              chega a oferecer.
 *
 * Arquivar NÃO derruba o acesso de quem usa a clínica — suspender cliente é
 * outra decisão. A tela diz isso em voz alta, porque "arquivar" sugere o
 * contrário.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  clinicaId: string;
  nome: string;
  arquivada: boolean;
}

interface Conteudo {
  pacientes: number; agendamentos: number; prontuarios: number;
  lancamentos: number; funcionarios: number; medicos: number; usuarios: number;
  vazia: boolean;
}

const ROTULOS: Array<[keyof Conteudo, string]> = [
  ['pacientes', 'pacientes'],
  ['prontuarios', 'prontuários'],
  ['agendamentos', 'agendamentos'],
  ['lancamentos', 'lançamentos'],
  ['medicos', 'médicos'],
  ['funcionarios', 'funcionários'],
  ['usuarios', 'usuários'],
];

export function AcoesDaClinica({ clinicaId, nome, arquivada }: Props) {
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<'arquivar' | 'excluir' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['platform-clinicas-overview'] });

  function fechar() {
    setAba(null); setMotivo(''); setConfirmacao(''); setConteudo(null);
  }

  async function abrirExclusao() {
    setOcupado(true);
    try {
      // O que há dentro vem do banco, não de um palpite da tela: é a MESMA
      // contagem que a exclusão usa para decidir.
      const { data, error } = await (supabase as any)
        .rpc('platform_conteudo_da_clinica', { _clinica_id: clinicaId });
      if (error) throw error;
      setConteudo(data as Conteudo);
      setAba('excluir');
    } catch (e: any) {
      toast.error('Não consegui verificar o conteúdo da clínica', { description: e?.message });
    } finally {
      setOcupado(false);
    }
  }

  async function arquivar() {
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any)
        .rpc('platform_arquivar_clinica', { _clinica_id: clinicaId, _motivo: motivo.trim() || null });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error ?? 'Falhou.');
      toast.success(`${nome} arquivada`, { description: 'Sai da lista, mas continua acessível para quem usa.' });
      fechar(); atualizar();
    } catch (e: any) {
      toast.error('Não consegui arquivar', { description: e?.message });
    } finally {
      setOcupado(false);
    }
  }

  async function desarquivar() {
    setOcupado(true);
    try {
      const { error } = await (supabase as any)
        .rpc('platform_desarquivar_clinica', { _clinica_id: clinicaId });
      if (error) throw error;
      toast.success(`${nome} voltou para a lista`);
      atualizar();
    } catch (e: any) {
      toast.error('Não consegui desarquivar', { description: e?.message });
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    setOcupado(true);
    try {
      const { data, error } = await (supabase as any)
        .rpc('platform_excluir_clinica_vazia', { _clinica_id: clinicaId, _confirmacao: confirmacao });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error ?? 'Falhou.');
      toast.success(`${nome} excluída`);
      fechar(); atualizar();
    } catch (e: any) {
      toast.error('Não consegui excluir', { description: e?.message });
    } finally {
      setOcupado(false);
    }
  }

  const itens = conteudo
    ? ROTULOS.filter(([k]) => Number(conteudo[k]) > 0).map(([k, r]) => `${conteudo[k]} ${r}`)
    : [];

  return (
    <>
      {arquivada ? (
        <Button variant="ghost" size="sm" onClick={desarquivar} disabled={ocupado} className="h-7 text-xs">
          <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Reativar
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAba('arquivar')} disabled={ocupado} className="h-7 text-xs">
          <Archive className="mr-1 h-3.5 w-3.5" /> Arquivar
        </Button>
      )}
      <Button
        variant="ghost" size="sm" onClick={abrirExclusao} disabled={ocupado}
        className="h-7 text-xs text-destructive hover:text-destructive"
      >
        {ocupado && aba === null
          ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          : <Trash2 className="mr-1 h-3.5 w-3.5" />}
        Excluir
      </Button>

      {/* ─── Arquivar ─── */}
      <Dialog open={aba === 'arquivar'} onOpenChange={a => !a && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Arquivar {nome}</DialogTitle>
            <DialogDescription>
              A clínica sai desta lista e os dados ficam guardados. Você pode
              reativar a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              Arquivar <strong>não</strong> derruba o acesso de quem usa a
              clínica — eles continuam entrando normalmente. Isto organiza a sua
              lista, não suspende o cliente.
            </div>
            <div className="space-y-1">
              <Label htmlFor="motivo-arquivar">Motivo (opcional)</Label>
              <Textarea
                id="motivo-arquivar" rows={2} value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ex.: cliente encerrou contrato em agosto"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            <Button onClick={arquivar} disabled={ocupado}>
              {ocupado && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Excluir ─── */}
      <Dialog open={aba === 'excluir'} onOpenChange={a => !a && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {nome}</DialogTitle>
            <DialogDescription>Exclusão é definitiva e não tem como voltar atrás.</DialogDescription>
          </DialogHeader>

          {conteudo && !conteudo.vazia ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="text-xs">
                  <p className="font-semibold text-destructive">Esta clínica tem dados</p>
                  <p className="text-muted-foreground">{itens.join(' · ')}</p>
                  <p className="mt-1 text-muted-foreground">
                    Prontuário precisa ser guardado por 20 anos (CFM 1.821/07).
                    Arquive em vez de excluir.
                  </p>
                </div>
              </div>
              <Button className="w-full" variant="outline" onClick={() => { setAba('arquivar'); }}>
                <Archive className="mr-1 h-4 w-4" /> Arquivar em vez de excluir
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Esta clínica está vazia: nenhum paciente, agendamento, prontuário,
                lançamento ou funcionário.
              </p>
              <div className="space-y-1">
                <Label htmlFor="confirma-nome">
                  Para confirmar, digite <strong>{nome}</strong>
                </Label>
                <Input
                  id="confirma-nome" value={confirmacao}
                  onChange={e => setConfirmacao(e.target.value)}
                  placeholder={nome}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            {conteudo?.vazia && (
              <Button
                variant="destructive" onClick={excluir}
                disabled={ocupado || confirmacao.trim() !== nome.trim()}
              >
                {ocupado && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Excluir definitivamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
