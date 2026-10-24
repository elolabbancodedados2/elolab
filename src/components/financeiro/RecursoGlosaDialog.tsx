import { useEffect, useId, useState } from 'react';
import { FileText, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { caminhoDocumentoRecurso, situacaoPrazoRecurso, validarDocumentoRecurso } from '@/lib/recursoGlosa';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export interface DocumentoRecurso { id: string; glosa_id: string; storage_path: string; file_name: string; created_at: string }

interface Props {
  glosa: { id: string; status: string; codigo_glosa: string; valor_glosado: number; recurso_justificativa: string | null; recurso_prazo: string | null; recurso_responsavel_id: string | null } | null;
  clinicaId: string;
  responsaveis: ReadonlyArray<{ id: string; nome: string | null }>;
  documentos: ReadonlyArray<DocumentoRecurso>;
  salvarJustificativa: (glosaId: string, justificativa: string) => Promise<boolean>;
  onClose: () => void;
  onChanged: () => Promise<unknown> | void;
}

const ROTULO_PRAZO = {
  vencido: { texto: 'Prazo vencido', className: 'text-destructive' },
  vence_em_breve: { texto: 'Vence em até 3 dias', className: 'text-warning-foreground' },
  no_prazo: { texto: 'No prazo', className: 'text-muted-foreground' },
} as const;

/** Prazo, responsável e anexos do recurso, exibidos na linha da glosa. */
export function ResumoRecurso({ glosa, responsavel, documentos }: { glosa: { status: string; recurso_prazo: string | null }; responsavel?: string | null; documentos: number }) {
  if (!glosa.recurso_prazo && !responsavel && documentos === 0) return null;
  const situacao = ['pendente', 'recurso_preparacao'].includes(glosa.status) ? situacaoPrazoRecurso(glosa.recurso_prazo, todaySaoPauloDateOnly()) : null;
  return <p className="mt-1 text-xs text-muted-foreground">
    {glosa.recurso_prazo && <>Prazo {glosa.recurso_prazo.split('-').reverse().join('/')}{situacao && <span className={`ml-1 font-medium ${ROTULO_PRAZO[situacao].className}`}>({ROTULO_PRAZO[situacao].texto})</span>} · </>}
    {responsavel && <>Responsável: {responsavel} · </>}
    {documentos} documento(s)
  </p>;
}

export function RecursoGlosaDialog({ glosa, clinicaId, responsaveis, documentos, salvarJustificativa, onClose, onChanged }: Props) {
  const id = useId();
  const [justificativa, setJustificativa] = useState('');
  const [prazo, setPrazo] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setJustificativa(glosa?.recurso_justificativa ?? '');
    setPrazo(glosa?.recurso_prazo ?? '');
    setResponsavel(glosa?.recurso_responsavel_id ?? '');
  }, [glosa?.id, glosa?.recurso_justificativa, glosa?.recurso_prazo, glosa?.recurso_responsavel_id]);

  async function salvar() {
    if (!glosa) return;
    if (justificativa.trim().length < 10) return toast.error('Descreva a justificativa do recurso (mínimo de 10 caracteres).');
    if (!prazo || !responsavel) return toast.error('Informe o prazo e o responsável pelo recurso.');
    setSalvando(true);
    try {
      if (!(await salvarJustificativa(glosa.id, justificativa.trim()))) return;
      const { error } = await supabase.rpc('definir_recurso_glosa', { p_glosa_id: glosa.id, p_prazo: prazo, p_responsavel_id: responsavel });
      if (error) throw error;
      await onChanged();
      onClose();
    } catch (error: any) {
      toast.error('Não foi possível salvar prazo e responsável.', { description: error?.message });
    } finally { setSalvando(false); }
  }

  async function anexar(arquivo: File | undefined) {
    if (!glosa || !arquivo) return;
    const erro = validarDocumentoRecurso(arquivo);
    if (erro) return toast.error(erro);
    setSalvando(true);
    try {
      const caminho = caminhoDocumentoRecurso(clinicaId, glosa.id, arquivo.name, crypto.randomUUID());
      const { error: uploadError } = await supabase.storage.from('recursos-glosa').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc('registrar_documento_recurso_glosa', {
        p_glosa_id: glosa.id, p_storage_path: caminho, p_file_name: arquivo.name, p_content_type: arquivo.type, p_byte_size: arquivo.size,
      });
      if (error) throw error;
      await onChanged();
      toast.success('Documento anexado ao recurso.');
    } catch (error: any) {
      toast.error('Não foi possível anexar o documento.', { description: error?.message });
    } finally { setSalvando(false); }
  }

  async function abrir(caminho: string) {
    const { data, error } = await supabase.storage.from('recursos-glosa').createSignedUrl(caminho, 300);
    if (error || !data?.signedUrl) return toast.error('Não foi possível abrir o documento.', { description: error?.message });
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return <Dialog open={!!glosa} onOpenChange={open => { if (!open && !salvando) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{glosa?.status === 'recurso_preparacao' ? 'Revisar recurso' : 'Preparar recurso de glosa'}</DialogTitle>
        <DialogDescription>Glosa {glosa?.codigo_glosa} · {brl(Number(glosa?.valor_glosado || 0))}</DialogDescription>
      </DialogHeader>
      <fieldset disabled={salvando} className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor={`${id}-just`}>Justificativa do recurso</Label><Textarea id={`${id}-just`} rows={4} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Descreva por que a cobrança deve ser revista pela operadora…" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${id}-prazo`}>Prazo para envio</Label><Input id={`${id}-prazo`} type="date" value={prazo} onChange={e => setPrazo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-resp`}>Responsável</Label><Select value={responsavel} onValueChange={setResponsavel}><SelectTrigger id={`${id}-resp`}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{responsaveis.map(r => <SelectItem key={r.id} value={r.id}>{r.nome || 'Usuário sem nome'}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-doc`}>Documentos anexos (PDF, JPEG ou PNG, até 10 MB)</Label>
          <Input id={`${id}-doc`} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => { void anexar(e.target.files?.[0]); e.target.value = ''; }} />
          {documentos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p> : <ul className="space-y-1">{documentos.map(d => <li key={d.id}><Button type="button" variant="link" className="h-auto gap-1 p-0 text-xs text-[#1080CA]" onClick={() => void abrir(d.storage_path)}><FileText aria-hidden="true" className="h-3.5 w-3.5" />{d.file_name}</Button></li>)}</ul>}
        </div>
        <p className="text-xs text-muted-foreground">O recurso só pode ser marcado como enviado com justificativa, prazo e responsável registrados.</p>
      </fieldset>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button onClick={() => void salvar()} disabled={salvando || justificativa.trim().length < 10 || !prazo || !responsavel}>{salvando ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar recurso</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
