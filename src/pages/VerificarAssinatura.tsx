import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, ShieldX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface VerificationResult {
  found: boolean;
  valid: boolean;
  documentType: string;
  documentReference: string;
  signerName: string;
  signerCRM: string;
  signedAt: string;
  method: string;
  hash: string;
}

export default function VerificarAssinatura() {
  const { codigo } = useParams();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationError, setVerificationError] = useState(false);
  const [invalidCode, setInvalidCode] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setResult(null);
    setVerificationError(false);
    setInvalidCode(false);
    if (!codigo || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codigo)) {
      setInvalidCode(true);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('verificar_assinatura_prontuario', { p_codigo: codigo });
        if (error) throw error;
        if (active) setResult(data ?? null);
      } catch {
        if (active) setVerificationError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [codigo, retry]);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-12">
      <Card className="mx-auto max-w-xl">
        <CardHeader className="text-center">
          <FileCheck2 className="mx-auto h-10 w-10 text-primary" />
          <CardTitle>Verificação de assinatura</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Verificando integridade…</div>
          ) : verificationError ? (
            <div className="space-y-3 text-center">
              <div role="alert" className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-center">
                <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-warning" />
                <p className="font-semibold">Não foi possível verificar agora</p>
                <p className="mt-1 text-xs text-muted-foreground">O serviço está indisponível. Isso não confirma nem invalida a assinatura; tente novamente.</p>
              </div>
              <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button>
            </div>
          ) : invalidCode ? (
            <StatusInvalid title="Código inválido" text="O endereço está incompleto ou o código de verificação não tem o formato esperado." />
          ) : !result ? (
            <StatusInvalid title="Assinatura não encontrada" text="Confira se o endereço ou código de verificação está completo." />
          ) : result.valid ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
                <p className="font-semibold text-success">Documento íntegro e assinatura válida</p>
                <p className="mt-1 text-xs text-muted-foreground">O conteúdo atual corresponde ao hash registrado no momento da assinatura.</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Documento</dt><dd><Badge variant="outline">Prontuário #{result.documentReference}</Badge></dd>
                <dt className="text-muted-foreground">Assinante</dt><dd className="font-medium">{result.signerName}</dd>
                <dt className="text-muted-foreground">CRM</dt><dd>{result.signerCRM}</dd>
                <dt className="text-muted-foreground">Assinado em</dt><dd>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(result.signedAt))}</dd>
                <dt className="text-muted-foreground">Hash SHA-256</dt><dd className="break-all font-mono text-[10px]">{result.hash}</dd>
              </dl>
            </div>
          ) : <StatusInvalid title="Integridade não confirmada" text="O conteúdo atual não corresponde ao hash registrado. Entre em contato com a clínica emissora." />}
        </CardContent>
      </Card>
    </main>
  );
}

function StatusInvalid({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center"><ShieldX className="mx-auto mb-2 h-8 w-8 text-destructive" /><p className="font-semibold text-destructive">{title}</p><p className="mt-1 text-xs text-muted-foreground">{text}</p></div>;
}
