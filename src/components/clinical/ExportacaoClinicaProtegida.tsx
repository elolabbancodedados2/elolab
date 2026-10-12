import { useEffect, useState } from 'react';
import { Download, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { criptografarExportClinico } from '@/lib/clinicalExportEncryption';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudo: string;
  nomeArquivo: string;
  tipo: 'application/json' | 'application/xml';
  onBeforeDownload?: () => Promise<void>;
}

export function ExportacaoClinicaProtegida({ open, onOpenChange, conteudo, nomeArquivo, tipo, onBeforeDownload }: Props) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) {
      setSenha('');
      setConfirmacao('');
      setMostrarSenha(false);
    }
  }, [open]);

  const gerarArquivo = async () => {
    if (senha.length < 12) return toast.error('Use uma senha com pelo menos 12 caracteres.');
    if (senha !== confirmacao) return toast.error('As senhas não conferem.');
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
      onOpenChange(false);
      toast.success('Arquivo clínico criptografado e baixado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível proteger a exportação.');
    } finally {
      setSalvando(false);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" />Proteger arquivo clínico</DialogTitle>
        <DialogDescription>O conteúdo será criptografado no navegador com AES-GCM. Guarde a senha e compartilhe-a por outro canal.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="export-password">Senha (mínimo 12 caracteres)</Label><div className="relative"><Input id="export-password" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" value={senha} onChange={event => setSenha(event.target.value)} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setMostrarSenha(value => !value)}>{mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div></div>
        <div className="space-y-1.5"><Label htmlFor="export-password-confirm">Confirme a senha</Label><Input id="export-password-confirm" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" value={confirmacao} onChange={event => setConfirmacao(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void gerarArquivo(); }} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button><Button onClick={() => void gerarArquivo()} disabled={salvando || !conteudo}><Download className="mr-2 h-4 w-4" />{salvando ? 'Criptografando…' : 'Baixar arquivo protegido'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
