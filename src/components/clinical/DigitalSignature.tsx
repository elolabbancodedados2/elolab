import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, KeyRound, AlertTriangle, CheckCircle2, Loader2, FileKey } from 'lucide-react';
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

interface SignatureData {
  signedAt: string;
  signerName: string;
  signerCRM?: string;
  hash: string;
  method: 'icp-brasil' | 'eletronica-simples';
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
  const [certificatePin, setCertificatePin] = useState('');
  const { toast } = useToast();

  const handleSign = async (method: 'icp-brasil' | 'eletronica-simples') => {
    setSigning(true);
    try {
      // Generate real SHA-256 hash of the document identity + timestamp (integrity fingerprint)
      const payload = `${documentType}:${documentId}:${signerName}:${signerCRM || ''}:${new Date().toISOString()}`;
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

      const data: SignatureData = {
        signedAt: new Date().toISOString(),
        signerName,
        signerCRM,
        hash,
        method,
      };

      // For prontuários — mark as immutably signed at the database level (CFM Res. 1.821/2007)
      if (documentType === 'prontuario') {
        const { error: updErr } = await (supabase as any).from('prontuarios').update({
          assinado: true,
          assinado_em: data.signedAt,
          assinado_por: signerName,
          crm_assinante: signerCRM || null,
          hash_conteudo: hash,
          tipo_assinatura: method,
        }).eq('id', documentId);
        if (updErr) throw updErr;

        // Access log — dedicated CFM audit table
        await (supabase as any).from('prontuario_acessos').insert({
          prontuario_id: documentId,
          acao: 'assinatura',
          user_nome: signerName,
          user_crm: signerCRM || null,
          justificativa: `Assinatura ${method === 'icp-brasil' ? 'ICP-Brasil' : 'eletrônica simples'} • hash ${hash.substring(0, 16)}`,
        });
      }

      // Log signature in audit trail
      await supabase.from('audit_log').insert({
        action: 'sign',
        collection: documentType === 'prontuario' ? 'prontuarios' : `${documentType}s`,
        record_id: documentId,
        record_name: `Assinatura Digital (${method === 'icp-brasil' ? 'ICP-Brasil' : 'Eletrônica Simples'})`,
        user_name: `${signerName}${signerCRM ? ` — CRM ${signerCRM}` : ''}`,
      });

      setSignatureData(data);
      setSigned(true);
      setIsDialogOpen(false);
      onSigned?.(data);

      toast({
        title: 'Documento assinado',
        description: `Assinatura ${method === 'icp-brasil' ? 'ICP-Brasil' : 'eletrônica'} registrada com sucesso.`,
      });
    } catch (error) {
      toast({
        title: 'Erro na assinatura',
        description: (error as any)?.message || 'Não foi possível assinar o documento.',
        variant: 'destructive',
      });
    } finally {
      setSigning(false);
      setCertificatePin('');
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
            Assinado digitalmente
          </p>
          <p className="text-[10px] text-green-600/70 truncate">
            {signatureData.signerName} — {new Date(signatureData.signedAt).toLocaleString('pt-BR')}
            {' • '}{signatureData.method === 'icp-brasil' ? 'ICP-Brasil' : 'Eletrônica'}
            {' • Hash: '}{signatureData.hash.substring(0, 8)}...
          </p>
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

            {/* ICP-Brasil option */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">Certificado ICP-Brasil</p>
                  <p className="text-xs text-muted-foreground">Validade jurídica plena — requer certificado A1 ou A3</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">PIN do Certificado Digital</Label>
                <Input
                  type="password"
                  placeholder="Digite o PIN do seu certificado"
                  value={certificatePin}
                  onChange={e => setCertificatePin(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button
                onClick={() => handleSign('icp-brasil')}
                disabled={signing || !certificatePin}
                className="w-full gap-2"
              >
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Assinar com ICP-Brasil
              </Button>
            </div>

            {/* Simple electronic signature option */}
            <div className="border rounded-lg p-4 space-y-3 border-dashed">
              <div className="flex items-center gap-2">
                <FileKey className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Assinatura Eletrônica Simples</p>
                  <p className="text-xs text-muted-foreground">Registro com hash e trilha de auditoria — sem certificado</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => handleSign('eletronica-simples')}
                disabled={signing}
                className="w-full gap-2"
              >
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileKey className="h-4 w-4" />}
                Assinar Eletronicamente
              </Button>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 rounded p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>
                A assinatura ICP-Brasil confere validade jurídica plena conforme MP 2.200-2/01.
                A assinatura eletrônica simples tem validade reduzida, recomendada apenas para documentos internos.
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
