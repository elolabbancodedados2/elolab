import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileEdit, Plus, Lock, Loader2, ScrollText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Adendo {
  id: string;
  tipo: 'retificacao' | 'complemento' | 'erratum';
  motivo: string;
  texto: string;
  medico_nome: string;
  crm: string;
  created_at: string;
  hash?: string | null;
}

interface Props {
  prontuarioId: string;
  medicoId?: string | null;
  medicoNome?: string;
  crm?: string;
  disabled?: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const tipoLabels: Record<string, { label: string; color: string }> = {
  retificacao: { label: 'Retificação', color: 'bg-warning/10 text-warning border-warning/20' },
  complemento: { label: 'Complemento', color: 'bg-info/10 text-info border-info/20' },
  erratum: { label: 'Erratum', color: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export function ProntuarioAdendos({ prontuarioId, medicoId, medicoNome, crm, disabled }: Props) {
  const [adendos, setAdendos] = useState<Adendo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ tipo: Adendo['tipo']; motivo: string; texto: string }>({
    tipo: 'complemento', motivo: '', texto: '',
  });

  const load = useCallback(async () => {
    if (!prontuarioId) return;
    setLoading(true);
    const { data } = await (supabase as any).from('prontuario_adendos')
      .select('*').eq('prontuario_id', prontuarioId).order('created_at', { ascending: true });
    setAdendos(data || []);
    setLoading(false);
  }, [prontuarioId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.motivo.trim() || !form.texto.trim()) {
      toast.error('Preencha motivo e conteúdo', { description: 'Ambos são obrigatórios (CFM Res. 1.638/2002).' });
      return;
    }
    if (!medicoNome || !crm) {
      toast.error('Médico não identificado', { description: 'Adendos exigem identificação do profissional com CRM.' });
      return;
    }
    setSaving(true);
    try {
      const hash = await sha256Hex(`${prontuarioId}|${form.tipo}|${form.motivo}|${form.texto}|${new Date().toISOString()}`);
      const { error } = await (supabase as any).from('prontuario_adendos').insert({
        prontuario_id: prontuarioId,
        medico_id: medicoId || null,
        medico_nome: medicoNome,
        crm,
        tipo: form.tipo,
        motivo: form.motivo.trim(),
        texto: form.texto.trim(),
        hash,
      });
      if (error) throw error;

      // Log de acesso — ação: adendo
      await (supabase as any).from('prontuario_acessos').insert({
        prontuario_id: prontuarioId,
        acao: 'adendo',
        user_nome: medicoNome,
        user_crm: crm,
        justificativa: form.motivo.trim(),
      });

      toast.success('Adendo registrado', { description: 'Registro imutável adicionado ao prontuário.' });
      setForm({ tipo: 'complemento', motivo: '', texto: '' });
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error('Erro ao registrar adendo', { description: err.message || 'Tente novamente.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Adendos e Retificações
          </span>
          {adendos.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{adendos.length}</Badge>
          )}
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="h-7 text-[10px] gap-1 rounded-lg"
        >
          <Plus className="h-3 w-3" />Novo Adendo
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground flex items-start gap-1.5 bg-muted/40 rounded-lg p-2">
        <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          Conforme <strong>Res. CFM nº 1.638/2002 art. 5º</strong>, o prontuário não pode ser alterado ou apagado.
          Correções e complementos devem ser registrados como adendos, com data, motivo e identificação do profissional.
        </span>
      </p>

      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : adendos.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-foreground">
          <FileEdit className="h-8 w-8 opacity-20 mb-2" />
          <p className="text-xs">Nenhum adendo registrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {adendos.map((a, idx) => {
            const tipo = tipoLabels[a.tipo] || tipoLabels.complemento;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="border border-border/60 rounded-xl p-3 space-y-2 bg-card"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 ${tipo.color}`}>{tipo.label}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      • Dr(a). {a.medico_nome} — CRM {a.crm}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono">
                    <Lock className="h-2.5 w-2.5 mr-0.5" />imutável
                  </Badge>
                </div>
                <div className="text-xs space-y-1">
                  <p><strong className="text-muted-foreground">Motivo:</strong> {a.motivo}</p>
                  <p className="whitespace-pre-wrap">{a.texto}</p>
                </div>
                {a.hash && (
                  <p className="text-[9px] text-muted-foreground font-mono truncate">
                    hash: {a.hash.substring(0, 24)}…
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-primary" />
              Novo Adendo ao Prontuário
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="complemento">Complemento (adicionar informação)</SelectItem>
                  <SelectItem value="retificacao">Retificação (corrigir registro)</SelectItem>
                  <SelectItem value="erratum">Erratum (erro material)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo *</Label>
              <Textarea
                placeholder="Descreva o motivo do adendo..."
                value={form.motivo}
                onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                rows={2} className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Conteúdo do Adendo *</Label>
              <Textarea
                placeholder="Registro complementar ou retificação..."
                value={form.texto}
                onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                rows={6} className="text-xs"
              />
            </div>
            <div className="flex items-start gap-2 text-[10px] text-muted-foreground bg-warning/8 border border-warning/20 rounded-lg p-2">
              <Lock className="h-3 w-3 mt-0.5 flex-shrink-0 text-warning" />
              <span>
                Adendos são <strong>imutáveis</strong> após salvos. Serão registrados com sua identificação
                (<strong>{medicoNome || '—'}</strong>{crm ? ` — CRM ${crm}` : ''}), data/hora e hash de integridade.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Registrar Adendo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}