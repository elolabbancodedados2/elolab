import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { mensagemDeErro } from '@/lib/erros';
import {
  anonimizarPacienteLgpd,
  AnonimizacaoLgpdIndisponivelError,
} from '@/lib/lgpdCompliance';
import { AnonimizacaoLgpdError, type ResultadoAnonimizacao } from '@/lib/lgpdAnonimizacao';

export interface AnonimizarPacienteDialogProps {
  paciente: { id: string; nome: string } | null;
  clinicaId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de uma anonimização concluída, para recarregar a lista. */
  onConcluido?: () => void;
}

function textoDoErro(erro: unknown): string {
  // Estes dois já trazem a frase traduzida para o usuário.
  if (erro instanceof AnonimizacaoLgpdError || erro instanceof AnonimizacaoLgpdIndisponivelError) {
    return erro.message;
  }
  return mensagemDeErro(erro);
}

/**
 * Anonimização LGPD de um paciente (CLIN-QA-004). Só aparece quando
 * ANONIMIZACAO_LGPD_HABILITADA estiver ligada. O prontuário é preservado; a
 * regra e as checagens ficam na RPC lgpd_anonimizar_paciente.
 */
export function AnonimizarPacienteDialog({
  paciente,
  clinicaId,
  open,
  onOpenChange,
  onConcluido,
}: AnonimizarPacienteDialogProps) {
  const [motivo, setMotivo] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAnonimizacao | null>(null);

  // Cada abertura começa limpa, para não reaproveitar a confirmação de outro paciente.
  useEffect(() => {
    if (open) {
      setMotivo('');
      setConfirmacao('');
      setErro(null);
      setResultado(null);
    }
  }, [open, paciente?.id]);

  const podeEnviar =
    !!paciente && !!clinicaId && motivo.trim().length >= 10 && confirmacao.trim().length > 0;

  const enviar = async () => {
    if (!paciente || !clinicaId) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await anonimizarPacienteLgpd({
        pacienteId: paciente.id,
        clinicaId,
        motivo,
        confirmacaoNome: confirmacao,
      });
      setResultado(r);
      onConcluido?.();
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Anonimizar paciente
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Paciente: <strong>{paciente?.nome}</strong>
              </p>
              <p>
                Os dados cadastrais serão substituídos de forma irreversível. Prontuário, exames,
                prescrições e lançamentos financeiros são preservados por obrigação legal.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {resultado ? (
          <div className="space-y-2" role="status">
            {resultado.situacao === 'ja_anonimizado' ? (
              <p>Este paciente já havia sido anonimizado. Nenhum dado foi alterado.</p>
            ) : (
              <>
                <p>Paciente anonimizado. Registro: {resultado.rotulo}.</p>
                {resultado.pendencias.length > 0 && (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {resultado.pendencias.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="anonimizar-motivo">Motivo (mínimo de 10 caracteres)</Label>
              <Textarea
                id="anonimizar-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="anonimizar-confirmacao">
                Para confirmar, digite o nome completo do paciente
              </Label>
              <Input
                id="anonimizar-confirmacao"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                autoComplete="off"
              />
            </div>
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <AlertDialogFooter>
          {resultado ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" onClick={enviar} disabled={!podeEnviar || enviando}>
                {enviando ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Anonimizando...
                  </span>
                ) : (
                  'Anonimizar'
                )}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
