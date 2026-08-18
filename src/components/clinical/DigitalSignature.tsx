import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, AlertTriangle, CheckCircle2, Loader2, FileKey, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
}: DigitalSignatureProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!alreadySigned || documentType !== 'prontuario') return;
    (supabase as any).from('prontuario_assinaturas')
      .select('codigo_verificacao').eq('prontuario_id', documentId).maybeSingle()
      .then(({ data }: any) => setVerificationCode(data?.codigo_verificacao ?? null));
  }, [alreadySigned, documentId, documentType]);

  const handleSign = async () => {
    setSigning(true);
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

      toast({
        title: 'Documento assinado',
        description: 'Assinatura eletrônica registrada. O documento não pode mais ser editado.',
      });
    } catch (error) {
      toast({
        title: 'Erro na assinatura',
        description: (error as any)?.message || 'Não foi possível assinar o documento.',
        variant: 'destructive',
      });
    } finally {
      setSigning(false);
    }
  };

  if (alreadySigned && !signed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2"
      >
        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-green-700">Assinado digitalmente</p>
          <p className="text-[10px] text-green-600/70 truncate">
            {signerName}{signerCRM ? ` — CRM ${signerCRM}` : ''}
            {signedAt && ` • ${new Date(signedAt).toLocaleString('pt-BR')}`}
          </p>
          {verificationCode && <VerificationLink code={verificationCode} />}
        </div>
      </motion.div>
    );
  }

  if (signed && signatureData) {
    return (
      <motion.div
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

  return (
    <>
      <Button
        variant="outline"
        size={compact ? 'sm' : 'default'}
        onClick={() => setIsDialogOpen(true)}
        className="gap-1.5"
      >
        <FileKey className="h-3.5 w-3.5" />
        {compact ? 'Assinar' : 'Assinatura Digital'}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Assinatura Digital do Documento
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
                    Fecha o documento para edição e registra autor, CRM, data e hash na trilha de auditoria
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
                Esta é uma assinatura eletrônica simples (MP 2.200-2/01, art. 10 §2º): vale entre
                as partes e atende a exigência de imutabilidade do prontuário da CFM 1.821/07.
                Para validade jurídica plena perante terceiros, assine o PDF exportado com seu
                certificado ICP-Brasil no assinador gov.br.
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
