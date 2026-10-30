import { useEffect, useRef, useState } from 'react';
import { Download, Eye, EyeOff, FileLock2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { criptografarExportClinico } from '@/lib/clinicalExportEncryption';

interface Props {
  onCancel: () => void;
  conteudo: string;
  nomeArquivo: string;
  tipo: 'application/json' | 'application/xml';
  onBeforeDownload?: () => Promise<void>;
}

export function ExportacaoClinicaProtegida({ onCancel, conteudo, nomeArquivo, tipo, onBeforeDownload }: Props) {
  const pageRef = useRef<HTMLElement>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, []);

  const gerarArquivo = async () => {
    if (senha.length < 12) {
      setErro('Use uma senha com pelo menos 12 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }

    setErro('');
    setSalvando(true);
    try {
      const envelope = await criptografarExportClinico(conteudo, senha, globalThis.crypto, { tipo, nomeArquivo });
      await onBeforeDownload?.();
      const url = URL.createObjectURL(new Blob([envelope], { type: 'application/vnd.elolab.clinical-export+json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${nomeArquivo}.elolab`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Arquivo clínico criptografado e baixado.');
      onCancel();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível proteger a exportação.');
    } finally {
      setSalvando(false);
    }
  };

  const senhasDiferentes = confirmacao.length > 0 && senha !== confirmacao;
  const extension = tipo === 'application/xml' ? 'XML' : 'JSON';

  return (
    <section
      ref={pageRef}
      tabIndex={-1}
      className="mx-auto w-full max-w-3xl space-y-5 outline-none"
      data-testid="protected-clinical-export-page"
      aria-label="Etapa de proteção do arquivo clínico"
    >
      <PageHeader
        title="Proteger arquivo clínico"
        description="Defina uma senha para criptografar o arquivo neste dispositivo antes de baixá-lo."
        icon={<FileLock2 />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arquivo preparado para download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-3 rounded-md border bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Arquivo</dt>
              <dd className="mt-1 break-all font-medium">{nomeArquivo}.elolab</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Conteúdo original</dt>
              <dd className="mt-1 font-medium">{extension}</dd>
            </div>
          </dl>

          <form onSubmit={event => { event.preventDefault(); void gerarArquivo(); }} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="export-password">Senha de proteção</Label>
              <div className="relative">
                <Input
                  id="export-password"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={12}
                  value={senha}
                  onChange={event => { setSenha(event.target.value); setErro(''); }}
                  aria-describedby="export-password-help"
                  required
                  disabled={salvando}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setMostrarSenha(value => !value)} disabled={salvando}>
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p id="export-password-help" className="text-xs text-muted-foreground">Use pelo menos 12 caracteres. A senha não é salva pelo EloLab.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="export-password-confirm">Confirme a senha</Label>
              <Input
                id="export-password-confirm"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmacao}
                onChange={event => { setConfirmacao(event.target.value); setErro(''); }}
                required
                disabled={salvando}
                aria-invalid={senhasDiferentes}
              />
              {senhasDiferentes && <p className="text-xs text-destructive">As senhas não conferem.</p>}
            </div>

            <p role="note" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-muted-foreground">
              O navegador criptografa o conteúdo com AES-GCM. Guarde a senha e compartilhe-a por outro canal; não será possível recuperar o arquivo se ela for perdida.
            </p>

            {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onCancel} disabled={salvando}>Cancelar</Button>
              <Button type="submit" disabled={salvando || !conteudo || senha.length < 12 || senha !== confirmacao} className="min-h-10">
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {salvando ? 'Criptografando…' : 'Baixar arquivo protegido'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
