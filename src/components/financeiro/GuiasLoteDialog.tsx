import { useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AutorizacaoValidacao, GuiaLote, PendenciaLote } from '@/lib/tissLoteValidacao';
import { cn } from '@/lib/utils';

const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const TIPOS = [
  { value: 'consulta', label: 'Consulta' }, { value: 'exame', label: 'Exame' }, { value: 'procedimento', label: 'Procedimento' },
  { value: 'terapia', label: 'Terapia' }, { value: 'internacao', label: 'Internação' },
];
const ROTULO_CAMPO: Record<string, string> = {
  registro_ans: 'Registro ANS', versao_tiss: 'Versão TISS', numero_lote: 'Número do lote', guias: 'Guias',
  quantidade_guias: 'Quantidade de guias', valor_apresentado: 'Valor apresentado', numero_guia: 'Número da guia',
  numero_carteira: 'Carteira', codigo_procedimento: 'Código do procedimento', data_atendimento: 'Data do atendimento',
  autorizacao_id: 'Autorização', autorizacao_status: 'Status da autorização', autorizacao_convenio: 'Convênio da autorização',
  paciente_id: 'Paciente', tipo_servico: 'Serviço faturado',
};
const novaGuia = () => ({ numero_guia: '', numero_carteira: '', autorizacao_id: 'nenhuma', data_atendimento: '', codigo_procedimento: '', tipo_servico: 'consulta', quantidade: '1', valor_total: '' });

interface Props {
  lote: { id: string; numero_lote: string; status: string } | null;
  guias: ReadonlyArray<GuiaLote>;
  autorizacoes: ReadonlyArray<AutorizacaoValidacao & { paciente_nome?: string | null }>;
  pendencias: ReadonlyArray<PendenciaLote>;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<unknown> | void;
}

export function GuiasLoteDialog({ lote, guias, autorizacoes, pendencias, onOpenChange, onChanged }: Props) {
  const [form, setForm] = useState(novaGuia);
  const [salvando, setSalvando] = useState(false);
  const id = useId();
  const editavel = lote?.status === 'rascunho';
  const autorizacaoSelecionada = autorizacoes.find(a => a.id === form.autorizacao_id);

  async function adicionar() {
    if (!lote) return;
    const valor = Number(form.valor_total);
    const quantidade = Number(form.quantidade);
    if (!form.numero_guia.trim() || !form.data_atendimento || !form.codigo_procedimento.trim()) return toast.error('Informe número da guia, data do atendimento e código do procedimento.');
    if (!Number.isInteger(quantidade) || quantidade < 1) return toast.error('Informe uma quantidade inteira maior que zero.');
    if (!Number.isFinite(valor) || valor <= 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-7) return toast.error('Informe um valor maior que zero com no máximo duas casas decimais.');
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc('adicionar_guia_lote_tiss', {
        p_lote_id: lote.id,
        p_numero_guia: form.numero_guia.trim(),
        p_numero_carteira: form.numero_carteira.trim() || null,
        p_paciente_id: autorizacaoSelecionada?.paciente_id ?? null,
        p_autorizacao_id: autorizacaoSelecionada?.id ?? null,
        p_data_atendimento: form.data_atendimento,
        p_codigo_procedimento: form.codigo_procedimento.trim(),
        p_tipo_servico: form.tipo_servico,
        p_quantidade: quantidade,
        p_valor_total: Number(valor.toFixed(2)),
      });
      if (error) throw error;
      if (!(data as { success?: boolean } | null)?.success) throw new Error('O banco não confirmou a inclusão da guia.');
      setForm(novaGuia());
      await onChanged();
      toast.success('Guia incluída no lote.');
    } catch (error: any) {
      toast.error('Não foi possível incluir a guia.', { description: error?.code === '23505' ? 'Este número de guia já está no lote.' : error?.message });
    } finally { setSalvando(false); }
  }

  async function remover(guiaId: string) {
    setSalvando(true);
    try {
      const { error } = await supabase.rpc('remover_guia_lote_tiss', { p_guia_id: guiaId });
      if (error) throw error;
      await onChanged();
      toast.success('Guia removida do lote.');
    } catch (error: any) {
      toast.error('Não foi possível remover a guia.', { description: error?.message });
    } finally { setSalvando(false); }
  }

  const erros = pendencias.filter(p => p.gravidade === 'erro');
  return <Dialog open={!!lote} onOpenChange={open => { if (!salvando) onOpenChange(open); }}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Guias do lote {lote?.numero_lote}</DialogTitle>
        <DialogDescription>Confira cada guia antes de exportar ou registrar o envio. Divergências com a autorização e erros de preenchimento bloqueiam o envio.</DialogDescription>
      </DialogHeader>

      <section aria-label="Validação do lote" className={cn('rounded-xl border p-3 text-sm', erros.length ? 'border-destructive/30 bg-destructive/5' : 'border-[#BFD8EE] bg-[#F3F8FC]')}>
        {pendencias.length === 0
          ? <p className="flex items-center gap-2 text-success-foreground"><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />Lote consistente: nenhuma correção pendente.</p>
          : <ul className="space-y-1.5">{pendencias.map((p, i) => <li key={`${p.guiaId}-${p.campo}-${i}`} className="flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', p.gravidade === 'erro' ? 'text-destructive' : 'text-warning')} />
            <span><b>{p.numeroGuia ? `Guia ${p.numeroGuia}` : 'Lote'} · {ROTULO_CAMPO[p.campo] ?? p.campo}</b>{p.gravidade === 'aviso' && ' (aviso)'}: {p.mensagem}</span>
          </li>)}</ul>}
      </section>

      <div className="overflow-x-auto rounded-xl border border-border/60"><Table>
        <TableHeader><TableRow><TableHead>Guia</TableHead><TableHead>Atendimento</TableHead><TableHead>Procedimento</TableHead><TableHead>Autorização</TableHead><TableHead className="text-right">Valor</TableHead>{editavel && <TableHead><span className="sr-only">Ações</span></TableHead>}</TableRow></TableHeader>
        <TableBody>{guias.length === 0 ? <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhuma guia cadastrada neste lote.</TableCell></TableRow> : guias.map(g => {
          const a = autorizacoes.find(x => x.id === g.autorizacao_id);
          const qtd = pendencias.filter(p => p.guiaId === g.id && p.gravidade === 'erro').length;
          return <TableRow key={g.id}>
            <TableCell className="font-medium">{g.numero_guia}<p className="text-xs text-muted-foreground">Carteira {g.numero_carteira || '—'}</p>{qtd > 0 && <Badge variant="outline" className="mt-1 rounded-full border-destructive/40 text-destructive">{qtd} a corrigir</Badge>}</TableCell>
            <TableCell>{g.data_atendimento.split('-').reverse().join('/')}</TableCell>
            <TableCell>{g.codigo_procedimento}<p className="text-xs text-muted-foreground">{TIPOS.find(t => t.value === g.tipo_servico)?.label ?? g.tipo_servico} · {g.quantidade}x</p></TableCell>
            <TableCell>{a ? `${a.numero_autorizacao || 'sem número'} · ${a.status}` : g.autorizacao_id ? 'Não encontrada' : '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{brl(g.valor_total)}</TableCell>
            {editavel && <TableCell><Button size="icon" variant="ghost" className="h-9 w-9 rounded-full text-destructive" disabled={salvando} onClick={() => void remover(g.id)} aria-label={`Remover guia ${g.numero_guia}`}><Trash2 className="h-4 w-4" /></Button></TableCell>}
          </TableRow>;
        })}</TableBody>
      </Table></div>

      {editavel ? <fieldset disabled={salvando} className="space-y-3 rounded-xl border border-border/60 p-3">
        <legend className="px-1 text-sm font-semibold">Incluir guia</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor={`${id}-numero`}>Número da guia</Label><Input id={`${id}-numero`} maxLength={20} value={form.numero_guia} onChange={e => setForm(f => ({ ...f, numero_guia: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-carteira`}>Carteira do beneficiário</Label><Input id={`${id}-carteira`} maxLength={40} value={form.numero_carteira} onChange={e => setForm(f => ({ ...f, numero_carteira: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-data`}>Data do atendimento</Label><Input id={`${id}-data`} type="date" value={form.data_atendimento} onChange={e => setForm(f => ({ ...f, data_atendimento: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-codigo`}>Código TUSS</Label><Input id={`${id}-codigo`} inputMode="numeric" maxLength={20} value={form.codigo_procedimento} onChange={e => setForm(f => ({ ...f, codigo_procedimento: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-tipo`}>Serviço faturado</Label><Select value={form.tipo_servico} onValueChange={v => setForm(f => ({ ...f, tipo_servico: v }))}><SelectTrigger id={`${id}-tipo`}><SelectValue /></SelectTrigger><SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 lg:col-span-2"><Label htmlFor={`${id}-aut`}>Autorização</Label><Select value={form.autorizacao_id} onValueChange={v => setForm(f => ({ ...f, autorizacao_id: v }))}><SelectTrigger id={`${id}-aut`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nenhuma">Sem autorização</SelectItem>{autorizacoes.map(a => <SelectItem key={a.id} value={a.id}>{a.numero_autorizacao || 'Sem número'} · {a.paciente_nome || 'Paciente'} · {a.tipo_servico} · {a.status}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label htmlFor={`${id}-qtd`}>Qtd.</Label><Input id={`${id}-qtd`} type="number" min="1" step="1" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor={`${id}-valor`}>Valor (R$)</Label><Input id={`${id}-valor`} type="number" min="0.01" step="0.01" value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} /></div></div>
        </div>
        <div className="flex justify-end"><Button className="gap-2 rounded-full bg-[#1080CA] text-white hover:brightness-110" onClick={() => void adicionar()}>{salvando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Incluir guia</Button></div>
      </fieldset> : <p className="text-xs text-muted-foreground">O lote já foi enviado; as guias ficam somente para consulta.</p>}
    </DialogContent>
  </Dialog>;
}
