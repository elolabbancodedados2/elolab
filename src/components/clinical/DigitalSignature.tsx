import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, AlertTriangle, CheckCircle2, Loader2, FileKey, ExternalLink, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DigitalSignatureProps {
  documentId: string;
  documentType: 'prontuario' | 'prescricao' | 'atestado' | 'laudo';
  signerName: string;
  signerCRM?: string;
  onSigned?: (signatureData: SignatureData) => void;
  compact?: boolean;
  /** If the document is already signed, show the badge and disable re-signing. */
  alreadySigned?: boolean;
  signedAt?: string | null;
  /** Prevent signing while the editor contains a version not persisted on the server. */
  disabledReason?: string;
  fullPage?: boolean;
  onOpenReview?: () => void;
  onCloseReview?: () => void;
  triggerId?: string;
  patientName?: string;
}

/**
 * `method` mantém 'icp-brasil' apenas para ler registros antigos: existia um
 * botão "Assinar com ICP-Brasil" que pedia o PIN do certificado do médico, não
 * usava esse PIN para nada, e gravava o documento como assinado por certificado.
 * Nenhuma assinatura ICP acontecia — o app calcula um hash local e registra na
 * trilha de auditoria. Assinaturas novas só podem ser 'eletronica-simples',
 * que é o que de fato ocorre.
 */
interface SignatureData {
  signedAt: string;
  signerName: string;
  signerCRM?: string;
  hash: string;
  method: 'icp-brasil' | 'eletronica_simples';
  verificationCode?: string;
}

export function DigitalSignature({
  documentId,
  documentType,
  signerName,
  signerCRM,
  onSigned,
  compact = false,
  alreadySigned = false,
  signedAt = null,
  disabledReason,
  fullPage = false,
  onOpenReview,
  onCloseReview,
  triggerId,
  patientName,
}: DigitalSignatureProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (disabledReason) setIsDialogOpen(false);
  }, [disabledReason]);

  useEffect(() => {
    if (!alreadySigned || documentType !== 'prontuario') return;
    (supabase as any).from('prontuario_assinaturas')
      .select('codigo_verificacao').eq('prontuario_id', documentId).maybeSingle()
      .then(({ data }: any) => setVerificationCode(data?.codigo_verificacao ?? null));
  }, [alreadySigned, documentId, documentType]);

  if (fullPage && alreadySigned && !signed) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="clinical-signature-page">
        <PageHeader
          title="Documento já assinado"
          description={`Paciente: ${patientName || 'Paciente atual'}`}
          icon={<FileKey />}
          actions={<Button variant="outline" onClick={onCloseReview} className="min-h-10"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao prontuário</Button>}
        />
        <div role="status" className="space-y-2 rounded-lg border border-success/30 bg-success/5 p-5">
          <p className="font-semibold">Assinatura eletrônica registrada</p>
          <p className="text-sm text-muted-foreground">{signerName}{signerCRM ? ` · CRM ${signerCRM}` : ''}{signedAt ? ` · ${new Date(signedAt).toLocaleString('pt-BR')}` : ''}</p>
          {verificationCode && <VerificationLink code={verificationCode} />}
        </div>
      </section>
    );
  }

  const handleSign = async () => {
    if (disabledReason) return;
    setSigning(true);
    setSignError(null);
    try {
      if (documentType !== 'prontuario') throw new Error('Assinatura verificável ainda não disponível para este documento.');
      const { data, error } = await (supabase as any).rpc('assinar_prontuario_verificavel', { p_prontuario_id: documentId });
      if (error) throw error;
      const result = data as SignatureData;
      setVerificationCode(result.verificationCode ?? null);

      setSignatureData(result);
      setSigned(true);
      setIsDialogOpen(false);
      onSigned?.(result);
      onCloseReview?.();

      toast({
        title: 'Documento assinado',
        description: 'Assinatura eletrônica registrada. O documento não pode mais ser editado.',
      });
    } catch (error) {
      const message = (error as any)?.message || 'Tente novamente.';
      setSignError(message);
      toast({
        title: 'Erro na assinatura',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSigning(false);
    }
  };

  if (alreadySigned && !signed && !fullPage) {
    return (
      <motion.div
        id="clinical-signature-status"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2"
      >
        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-green-700">Assinado eletronicamente</p>
          <p className="text-[10px] text-green-600/70 truncate">
            {signerName}{signerCRM ? ` — CRM ${signerCRM}` : ''}
            {signedAt && ` • ${new Date(signedAt).toLocaleString('pt-BR')}`}
          </p>
          {verificationCode && <VerificationLink code={verificationCode} />}
        </div>
      </motion.div>
    );
  }

  if (signed && signatureData && !fullPage) {
    return (
      <motion.div
        id="clinical-signature-status"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2"
      >
        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-green-700">
            Assinado eletronicamente
          </p>
          {/* Registros antigos gravados como 'icp-brasil' também eram assinatura
              eletrônica simples — nenhum certificado foi usado. Exibir
              "ICP-Brasil" neles repetiria a afirmação falsa. */}
          <p className="text-[10px] text-green-600/70 truncate">
            {signatureData.signerName} — {new Date(signatureData.signedAt).toLocaleString('pt-BR')}
            {' • Hash: '}{signatureData.hash.substring(0, 8)}...
          </p>
          {verificationCode && <VerificationLink code={verificationCode} />}
        </div>
      </motion.div>
    );
  }

  if (fullPage) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="clinical-signature-page">
        <PageHeader
          title="Assinatura eletrônica do prontuário"
          description={`Paciente: ${patientName || 'Paciente atual'}`}
          icon={<FileKey />}
          actions={<Button variant="outline" onClick={onCloseReview} className="min-h-10"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao prontuário</Button>}
        />
        <section aria-labelledby="signature-review-heading" className="space-y-4 rounded-lg border bg-card p-5">
          <div>
            <h2 id="signature-review-heading" className="font-semibold">Revise a identificação antes de assinar</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Profissional</dt><dd className="font-medium">{signerName}</dd></div>
              <div><dt className="text-muted-foreground">Registro profissional</dt><dd>{signerCRM ? `CRM ${signerCRM}` : 'Não informado'}</dd></div>
              <div><dt className="text-muted-foreground">Documento</dt><dd>Prontuário</dd></div>
              <div><dt className="text-muted-foreground">Paciente</dt><dd>{patientName || 'Paciente atual'}</dd></div>
            </dl>
          </div>
          <div role="note" className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <p>Esta assinatura eletrônica simples registra profissional, CRM, horário e hash de integridade no servidor. Ela não utiliza certificado ICP-Brasil e não equivale a assinatura digital qualificada.</p>
            <p>Ao assinar, o prontuário fica bloqueado para edição. Complementações e correções devem ser feitas por adendo, mantendo o histórico.</p>
          </div>
          {disabledReason && <p role="alert" className="text-sm text-destructive">{disabledReason}</p>}
          {signError && <p role="alert" className="text-sm text-destructive">A assinatura não foi confirmada: {signError}. Revise o estado do prontuário antes de tentar novamente.</p>}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCloseReview} disabled={signing}>Cancelar</Button>
            <Button type="button" onClick={() => void handleSign()} disabled={signing || Boolean(disabledReason)} className="min-h-10">
              {signing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileKey className="mr-2 h-4 w-4" />}
              Assinar e fechar o documento
            </Button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size={compact ? 'sm' : 'default'}
        id={triggerId}
        onClick={() => onOpenReview ? onOpenReview() : setIsDialogOpen(true)}
        disabled={Boolean(disabledReason)}
        aria-describedby={disabledReason ? 'signature-disabled-reason' : undefined}
        className="gap-1.5"
      >
        <FileKey className="h-3.5 w-3.5" />
        {compact ? 'Assinar' : 'Assinatura eletrônica'}
      </Button>
      {disabledReason && <p id="signature-disabled-reason" className="text-[10px] text-muted-foreground">{disabledReason}</p>}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Assinatura eletrônica do prontuário
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Signer info */}
            <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
              <p className="text-sm font-medium">{signerName}</p>
              {signerCRM && <p className="text-xs text-muted-foreground">CRM: {signerCRM}</p>}
              <p className="text-xs text-muted-foreground">
                Documento: {documentType.charAt(0).toUpperCase() + documentType.slice(1)} #{documentId.substring(0, 8)}
              </p>
            </div>

            {/* Só existe um caminho porque só existe um comportamento. O botão
                "Assinar com ICP-Brasil" pedia o PIN do certificado, descartava
                o PIN e gravava exatamente esta mesma assinatura — dando ao
                médico a impressão de ter assinado com certificado. */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileKey className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">Assinatura eletrônica</p>
                  <p className="text-xs text-muted-foreground">
                Bloqueia o registro para edição e grava profissional, CRM, data e hash verificável no servidor.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleSign}
                disabled={signing}
                className="w-full gap-2"
              >
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileKey className="h-4 w-4" />}
                Assinar e fechar o documento
              </Button>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 rounded p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>
                Esta assinatura eletrônica simples não usa certificado ICP-Brasil e não substitui
                uma assinatura digital qualificada. A verificação confirma a integridade do
                conteúdo registrado no momento da assinatura.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VerificationLink({ code }: { code: string }) {
  return (
    <a href={`/verificar-assinatura/${code}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline">
      Verificar autenticidade <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
