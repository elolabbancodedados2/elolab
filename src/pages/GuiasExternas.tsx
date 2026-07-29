import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Upload, Search, ExternalLink, Loader2, Trash2, Eye,
  ArrowRight, CalendarPlus, CheckCircle2, X, Link2, Copy, Hash, FlaskConical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  recebida: { label: 'Recebida', variant: 'secondary' },
  em_analise: { label: 'Em análise', variant: 'default' },
  agendada: { label: 'Agendada', variant: 'default' },
  encaminhada_fila: { label: 'Na fila', variant: 'default' },
  finalizada: { label: 'Finalizada', variant: 'outline' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Manual',
  portal: 'Portal externo',
  email: 'E-mail',
  api: 'API',
};

export default function GuiasExternas() {
  const { profile, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);

  const { data: guias = [], isLoading } = useQuery({
    queryKey: ['guias_externas', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('guias_externas')
        .select('*')
        .order('data_recebimento', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (guias as any[]).filter((g) => {
      const matchSearch =
        !s ||
        g.paciente_nome?.toLowerCase().includes(s) ||
        g.medico_externo_nome?.toLowerCase().includes(s) ||
        g.convenio_nome?.toLowerCase().includes(s) ||
        g.numero_autorizacao?.toLowerCase().includes(s);
      const matchStatus = filterStatus === 'todos' || g.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [guias, search, filterStatus]);

  const counts = useMemo(() => {
    const c = { total: 0, recebida: 0, agendada: 0, fila: 0 };
    (guias as any[]).forEach((g) => {
      c.total++;
      if (g.status === 'recebida') c.recebida++;
      if (g.status === 'agendada') c.agendada++;
      if (g.status === 'encaminhada_fila') c.fila++;
    });
    return c;
  }, [guias]);

  const detail = useMemo(() => (guias as any[]).find((g) => g.id === detailId), [guias, detailId]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" /> Guias Externas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Receba pedidos de exames vindos de médicos e clínicas externas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTokens(true)} className="gap-1.5">
            <Link2 className="h-4 w-4" /> Portal externo
          </Button>
          <Button onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova guia
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: counts.total, color: 'text-foreground' },
          { label: 'Aguardando', value: counts.recebida, color: 'text-amber-600' },
          { label: 'Agendadas', value: counts.agendada, color: 'text-blue-600' },
          { label: 'Na fila', value: counts.fila, color: 'text-emerald-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Guias recebidas</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar paciente, médico, convênio..."
                  className="pl-8 w-[260px]"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="recebida">Recebidas</SelectItem>
                  <SelectItem value="em_analise">Em análise</SelectItem>
                  <SelectItem value="agendada">Agendadas</SelectItem>
                  <SelectItem value="encaminhada_fila">Na fila</SelectItem>
                  <SelectItem value="finalizada">Finalizadas</SelectItem>
                  <SelectItem value="cancelada">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma guia externa registrada</p>
              <p className="text-sm mt-1">Clique em "Nova guia" para começar.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Médico externo</TableHead>
                    <TableHead>Convênio / Aut.</TableHead>
                    <TableHead>Exames</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Recebida</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((g: any) => (
                    <TableRow key={g.id} className="hover:bg-muted/40">
                      <TableCell>
                        <p className="font-medium">{g.paciente_nome}</p>
                        {g.paciente_cpf && <p className="text-xs text-muted-foreground">{g.paciente_cpf}</p>}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{g.medico_externo_nome || '—'}</p>
                        {g.medico_externo_crm && (
                          <p className="text-xs text-muted-foreground">CRM {g.medico_externo_crm}/{g.medico_externo_uf || ''}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{g.convenio_nome || '—'}</p>
                        {g.numero_autorizacao && <p className="text-xs text-muted-foreground">#{g.numero_autorizacao}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <FlaskConical className="h-3 w-3" />
                          {Array.isArray(g.exames_solicitados) ? g.exames_solicitados.length : 0}
                        </Badge>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{ORIGEM_LABEL[g.origem] || g.origem}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(g.data_recebimento), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_LABEL[g.status]?.variant || 'secondary'}>
                          {STATUS_LABEL[g.status]?.label || g.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(g.id)} className="gap-1">
                          <Eye className="h-3.5 w-3.5" /> Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <GuiaFormDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          clinicaId={profile?.clinica_id}
          userId={user?.id}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['guias_externas'] });
            setShowForm(false);
          }}
        />
      )}

      {detail && (
        <DetalheGuiaDialog
          guia={detail}
          open={!!detail}
          onClose={() => setDetailId(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['guias_externas'] })}
        />
      )}

      {showTokens && (
        <TokensPortalDialog open={showTokens} onClose={() => setShowTokens(false)} clinicaId={profile?.clinica_id} userId={user?.id} />
      )}
    </div>
  );
}

/* ─── Form de criação manual ─── */
function GuiaFormDialog({ open, onClose, clinicaId, userId, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    paciente_nome: '',
    paciente_cpf: '',
    paciente_nascimento: '',
    paciente_telefone: '',
    medico_externo_nome: '',
    medico_externo_crm: '',
    medico_externo_uf: '',
    medico_externo_especialidade: '',
    convenio_nome: '',
    numero_autorizacao: '',
    validade_autorizacao: '',
    observacoes: '',
    anexo_url: '',
    anexo_nome: '',
    exames_texto: '',
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${clinicaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('guias-externas').upload(path, file);
      if (error) throw error;
      setForm((f) => ({ ...f, anexo_url: path, anexo_nome: file.name }));
      toast.success('Anexo enviado');
    } catch (e: any) {
      toast.error(e.message || 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.paciente_nome.trim()) { toast.error('Nome do paciente é obrigatório'); return; }
    const exames = form.exames_texto
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((nome) => ({ nome }));
    if (exames.length === 0) { toast.error('Liste ao menos um exame'); return; }

    setSaving(true);
    try {
      const { error } = await (supabase as any).from('guias_externas').insert({
        clinica_id: clinicaId,
        origem: 'manual',
        status: 'recebida',
        paciente_nome: form.paciente_nome.trim(),
        paciente_cpf: form.paciente_cpf || null,
        paciente_nascimento: form.paciente_nascimento || null,
        paciente_telefone: form.paciente_telefone || null,
        medico_externo_nome: form.medico_externo_nome || null,
        medico_externo_crm: form.medico_externo_crm || null,
        medico_externo_uf: form.medico_externo_uf || null,
        medico_externo_especialidade: form.medico_externo_especialidade || null,
        convenio_nome: form.convenio_nome || null,
        numero_autorizacao: form.numero_autorizacao || null,
        validade_autorizacao: form.validade_autorizacao || null,
        observacoes: form.observacoes || null,
        anexo_url: form.anexo_url || null,
        anexo_nome: form.anexo_nome || null,
        exames_solicitados: exames,
        registrado_por: userId,
      });
      if (error) throw error;
      toast.success('Guia externa registrada');
      onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova guia externa</DialogTitle>
          <DialogDescription>Registre um pedido de exames recebido de fora da clínica.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="paciente" className="mt-2">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="paciente">Paciente</TabsTrigger>
            <TabsTrigger value="medico">Médico</TabsTrigger>
            <TabsTrigger value="convenio">Convênio</TabsTrigger>
            <TabsTrigger value="exames">Exames</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="space-y-3 pt-3">
            <div><Label>Nome completo *</Label><Input value={form.paciente_nome} onChange={(e) => setForm({ ...form, paciente_nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input value={form.paciente_cpf} onChange={(e) => setForm({ ...form, paciente_cpf: e.target.value })} /></div>
              <div><Label>Data nascimento</Label><Input type="date" value={form.paciente_nascimento} onChange={(e) => setForm({ ...form, paciente_nascimento: e.target.value })} /></div>
            </div>
            <div><Label>Telefone</Label><Input value={form.paciente_telefone} onChange={(e) => setForm({ ...form, paciente_telefone: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="medico" className="space-y-3 pt-3">
            <div><Label>Nome do médico solicitante</Label><Input value={form.medico_externo_nome} onChange={(e) => setForm({ ...form, medico_externo_nome: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>CRM</Label><Input value={form.medico_externo_crm} onChange={(e) => setForm({ ...form, medico_externo_crm: e.target.value })} /></div>
              <div><Label>UF</Label><Input maxLength={2} value={form.medico_externo_uf} onChange={(e) => setForm({ ...form, medico_externo_uf: e.target.value.toUpperCase() })} /></div>
            </div>
            <div><Label>Especialidade</Label><Input value={form.medico_externo_especialidade} onChange={(e) => setForm({ ...form, medico_externo_especialidade: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="convenio" className="space-y-3 pt-3">
            <div><Label>Convênio</Label><Input value={form.convenio_nome} onChange={(e) => setForm({ ...form, convenio_nome: e.target.value })} placeholder="Ex.: Unimed, Bradesco..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nº autorização</Label><Input value={form.numero_autorizacao} onChange={(e) => setForm({ ...form, numero_autorizacao: e.target.value })} /></div>
              <div><Label>Validade</Label><Input type="date" value={form.validade_autorizacao} onChange={(e) => setForm({ ...form, validade_autorizacao: e.target.value })} /></div>
            </div>

            <div className="pt-2">
              <Label>Anexo da guia (PDF/imagem)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="file" accept="application/pdf,image/*" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading} />
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {form.anexo_nome && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {form.anexo_nome}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="exames" className="space-y-3 pt-3">
            <div>
              <Label>Exames solicitados (um por linha) *</Label>
              <Textarea
                rows={7}
                value={form.exames_texto}
                onChange={(e) => setForm({ ...form, exames_texto: e.target.value })}
                placeholder={'Hemograma completo\nGlicemia de jejum\nColesterol total e frações'}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Registrar guia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Detalhe + ações ─── */
function DetalheGuiaDialog({ guia, open, onClose, onChanged }: any) {
  const { profile } = useSupabaseAuth();
  const [agendando, setAgendando] = useState(false);
  const [dataAg, setDataAg] = useState('');
  const [horaAg, setHoraAg] = useState('');

  const updateStatus = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase as any).from('guias_externas').update(patch).eq('id', guia.id);
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); toast.success('Atualizado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const enviarParaFila = useMutation({
    mutationFn: async () => {
      // Garante paciente vinculado: cria avulso se necessário
      let pacienteId = guia.paciente_id;
      if (!pacienteId) {
        const { data: p, error: pErr } = await (supabase as any)
          .from('pacientes')
          .insert({
            nome: guia.paciente_nome,
            cpf: guia.paciente_cpf || null,
            data_nascimento: guia.paciente_nascimento || null,
            telefone: guia.paciente_telefone || null,
            email: guia.paciente_email || null,
            sexo: guia.paciente_sexo || null,
            clinica_id: profile?.clinica_id,
          })
          .select('id').single();
        if (pErr) throw pErr;
        pacienteId = p.id;
      }

      // Cria registros em exames + adiciona à fila de coleta
      const exames = Array.isArray(guia.exames_solicitados) ? guia.exames_solicitados : [];
      for (const ex of exames) {
        await (supabase as any).from('exames').insert({
          paciente_id: pacienteId,
          tipo_exame: ex.nome || ex.tipo || 'Exame',
          descricao: ex.descricao || guia.observacoes,
          status: 'solicitado',
          data_solicitacao: new Date().toISOString().slice(0, 10),
          categoria: 'laboratorio',
          clinica_id: profile?.clinica_id,
        });
      }

      await (supabase as any).from('guias_externas')
        .update({ status: 'encaminhada_fila', paciente_id: pacienteId })
        .eq('id', guia.id);
    },
    onSuccess: () => { onChanged(); toast.success('Guia enviada para a fila de coleta'); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const gerarAgendamento = useMutation({
    mutationFn: async () => {
      if (!dataAg || !horaAg) throw new Error('Informe data e hora');
      let pacienteId = guia.paciente_id;
      if (!pacienteId) {
        const { data: p, error: pErr } = await (supabase as any)
          .from('pacientes').insert({
            nome: guia.paciente_nome,
            cpf: guia.paciente_cpf || null,
            data_nascimento: guia.paciente_nascimento || null,
            telefone: guia.paciente_telefone || null,
            clinica_id: profile?.clinica_id,
          }).select('id').single();
        if (pErr) throw pErr;
        pacienteId = p.id;
      }
      const { data: ag, error: agErr } = await (supabase as any).from('agendamentos').insert({
        paciente_id: pacienteId,
        data: dataAg,
        hora_inicio: horaAg,
        tipo: 'coleta',
        status: 'agendado',
        observacoes: `Guia externa #${guia.id.slice(0, 8)} — ${guia.medico_externo_nome || ''}`,
        clinica_id: profile?.clinica_id,
      }).select('id').single();
      if (agErr) throw agErr;

      // Sem checar o erro, o agendamento era criado mas a guia continuava como
      // não agendada — a coleta existia na agenda e sumia do fluxo de guias.
      const { error: guiaErr } = await (supabase as any).from('guias_externas').update({
        status: 'agendada',
        paciente_id: pacienteId,
        agendamento_id: ag.id,
        data_agendamento: dataAg,
        hora_agendamento: horaAg,
      }).eq('id', guia.id);
      if (guiaErr) throw guiaErr;
    },
    onSuccess: () => { onChanged(); toast.success('Coleta agendada'); setAgendando(false); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAnexo = async () => {
    if (!guia.anexo_url) return;
    const { data } = await supabase.storage.from('guias-externas').createSignedUrl(guia.anexo_url, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Guia externa — {guia.paciente_nome}
          </DialogTitle>
          <DialogDescription>
            Recebida em {format(new Date(guia.data_recebimento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {ORIGEM_LABEL[guia.origem]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="CPF" value={guia.paciente_cpf} />
            <Info label="Nascimento" value={guia.paciente_nascimento} />
            <Info label="Telefone" value={guia.paciente_telefone} />
            <Info label="Convênio" value={guia.convenio_nome} />
            <Info label="Médico solicitante" value={guia.medico_externo_nome} />
            <Info label="CRM" value={guia.medico_externo_crm ? `${guia.medico_externo_crm}/${guia.medico_externo_uf || ''}` : null} />
            <Info label="Nº autorização" value={guia.numero_autorizacao} />
            <Info label="Validade autorização" value={guia.validade_autorizacao} />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Exames solicitados</Label>
            <div className="mt-2 rounded-md border divide-y">
              {(guia.exames_solicitados as any[] || []).map((ex, i) => (
                <div key={i} className="px-3 py-2 text-sm flex items-center gap-2">
                  <FlaskConical className="h-3.5 w-3.5 text-primary" />
                  {ex.nome || ex.tipo || '—'}
                  {ex.descricao && <span className="text-xs text-muted-foreground">— {ex.descricao}</span>}
                </div>
              ))}
            </div>
          </div>

          {guia.observacoes && <Info label="Observações" value={guia.observacoes} />}

          {guia.anexo_url && (
            <Button variant="outline" size="sm" onClick={openAnexo} className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir anexo: {guia.anexo_nome}
            </Button>
          )}

          {agendando && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium">Agendar coleta</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data</Label><Input type="date" value={dataAg} onChange={(e) => setDataAg(e.target.value)} /></div>
                  <div><Label>Hora</Label><Input type="time" value={horaAg} onChange={(e) => setHoraAg(e.target.value)} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setAgendando(false)}>Cancelar</Button>
                  <Button size="sm" onClick={() => gerarAgendamento.mutate()} disabled={gerarAgendamento.isPending}>
                    {gerarAgendamento.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Confirmar agendamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="mt-4 flex-wrap gap-2">
          {guia.status !== 'cancelada' && guia.status !== 'finalizada' && (
            <>
              <Button variant="outline" onClick={() => updateStatus.mutate({ status: 'cancelada' })}>
                <X className="h-4 w-4 mr-1" /> Cancelar guia
              </Button>
              {!agendando && (
                <Button variant="outline" onClick={() => setAgendando(true)} className="gap-1.5">
                  <CalendarPlus className="h-4 w-4" /> Agendar coleta
                </Button>
              )}
              <Button onClick={() => enviarParaFila.mutate()} disabled={enviarParaFila.isPending} className="gap-1.5">
                {enviarParaFila.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Enviar para fila de coleta
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

/* ─── Tokens do portal ─── */
function TokensPortalDialog({ open, onClose, clinicaId, userId }: any) {
  const queryClient = useQueryClient();
  const [descricao, setDescricao] = useState('');

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['portal_guias_tokens', clinicaId],
    enabled: !!clinicaId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('portal_guias_tokens')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const criarToken = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('portal_guias_tokens').insert({
        clinica_id: clinicaId, descricao: descricao.trim() || null, criado_por: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDescricao(''); queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Link gerado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: any) => {
      const { error } = await (supabase as any).from('portal_guias_tokens').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }),
  });

  const deletarToken = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('portal_guias_tokens').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Removido'); },
  });

  const baseUrl = window.location.origin;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" /> Portal externo de guias</DialogTitle>
          <DialogDescription>
            Gere links únicos para que médicos e clínicas externas enviem guias sem precisar fazer login.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Dr. José — Clínica Vida" />
          </div>
          <Button onClick={() => criarToken.mutate()} disabled={criarToken.isPending} className="gap-1.5">
            <Plus className="h-4 w-4" /> Gerar link
          </Button>
        </div>

        <div className="space-y-2 mt-3 max-h-[400px] overflow-y-auto">
          {isLoading ? <Skeleton className="h-20 w-full" /> :
            tokens.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nenhum link gerado.</p> :
            tokens.map((t: any) => {
              const url = `${baseUrl}/portal-guias/${t.token}`;
              return (
                <Card key={t.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{t.descricao || 'Link genérico'}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.ultimo_uso ? `Último uso: ${format(new Date(t.ultimo_uso), "dd/MM/yy HH:mm", { locale: ptBR })}` : 'Nunca usado'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.ativo} onCheckedChange={(v) => toggleAtivo.mutate({ id: t.id, ativo: v })} />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deletarToken.mutate(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={url} readOnly className="text-xs font-mono" />
                      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => { navigator.clipboard.writeText(url); toast.success('Copiado!'); }}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}