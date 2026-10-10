import { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Upload, Search, ExternalLink, Loader2, Trash2, Eye,
  ArrowRight, CalendarPlus, CheckCircle2, X, Link2, Copy, Hash, FlaskConical, AlertTriangle,
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
import { ErrorState } from '@/components/ErrorState';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { abrirUrlSegura, storageUrlSeguro } from '@/lib/safeUrl';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';
import { mensagemDeErro } from '@/lib/erros';
import { formatCPF, validateCPF } from '@/lib/formatters';

const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const FORMATADOR_DATA_HORA_LONGA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function formatarDataHoraSaoPaulo(value?: string | null, longo = false): string {
  if (!value) return '—';
  const instante = new Date(value);
  if (!Number.isFinite(instante.getTime())) return '—';
  return (longo ? FORMATADOR_DATA_HORA_LONGA : FORMATADOR_DATA_HORA).format(instante);
}

function paraDataHoraLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

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

async function obterOuCriarPacienteDaGuia(guia: any, clinicaId: string | null | undefined): Promise<string> {
  if (guia.paciente_id) return guia.paciente_id;
  if (!clinicaId) throw new Error('Clínica não identificada. Atualize a sessão e tente novamente.');

  const cpfOriginal = String(guia.paciente_cpf || '').trim();
  const cpfDigitos = cpfOriginal.replace(/\D/g, '');
  const cpfsPossiveis = new Set<string>(cpfOriginal ? [cpfOriginal] : []);
  if (cpfDigitos.length === 11) {
    cpfsPossiveis.add(cpfDigitos);
    cpfsPossiveis.add(`${cpfDigitos.slice(0, 3)}.${cpfDigitos.slice(3, 6)}.${cpfDigitos.slice(6, 9)}-${cpfDigitos.slice(9)}`);
  }

  const buscarPacientePorCpf = async () => {
    if (cpfDigitos.length !== 11 || cpfsPossiveis.size === 0) return null;
    const { data, error } = await supabase.from('pacientes')
      .select('id')
      .eq('clinica_id', clinicaId)
      .in('cpf', [...cpfsPossiveis])
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  };

  const pacienteExistente = await buscarPacientePorCpf();
  if (pacienteExistente) return pacienteExistente;

  const { data, error } = await (supabase as any).from('pacientes').insert({
    nome: guia.paciente_nome,
    cpf: cpfOriginal || null,
    data_nascimento: guia.paciente_nascimento || null,
    telefone: guia.paciente_telefone || null,
    email: guia.paciente_email || null,
    sexo: guia.paciente_sexo || null,
    clinica_id: clinicaId,
  }).select('id').single();
  if (!error && data?.id) return data.id;

  // A unicidade do CPF é por clínica e sem máscara. Se outra operação criou o
  // paciente entre a busca e o INSERT, reaproveitamos o cadastro existente.
  if ((error as any)?.code === '23505' && cpfDigitos.length === 11) {
    const pacienteConcorrente = await buscarPacientePorCpf();
    if (pacienteConcorrente) return pacienteConcorrente;
  }
  if (error) throw error;
  throw new Error('Não foi possível vincular ou criar o cadastro do paciente.');
}

export default function GuiasExternas() {
  const { profile, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState(false);

  const { data: guias = [], isLoading, error: guiasError, refetch: refetchGuias } = useQuery({
    queryKey: ['guias_externas', profile?.clinica_id],
    enabled: !!profile?.clinica_id,
    queryFn: async () => {
      return buscarEmBlocos<any>(() => (supabase as any)
        .from('guias_externas')
        .select('*')
        .eq('clinica_id', profile!.clinica_id)
        .order('data_recebimento', { ascending: false })
        .order('id', { ascending: true }));
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
          {guias.length >= LIMITE_BUSCA_EM_BLOCOS && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>A lista atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} guias. Guias mais antigas podem não aparecer; refine a busca ou o status.</p>
            </div>
          )}
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : guiasError ? (
            <ErrorState compact title="Não foi possível carregar as guias externas" error={guiasError} onRetry={() => void refetchGuias()} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{search || filterStatus !== 'todos' ? 'Nenhuma guia corresponde aos filtros' : 'Nenhuma guia externa registrada'}</p>
              <p className="text-sm mt-1">{search || filterStatus !== 'todos' ? 'Altere ou limpe a busca e o status selecionado.' : 'Clique em "Nova guia" para começar.'}</p>
              {(search || filterStatus !== 'todos') && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(''); setFilterStatus('todos'); }}>
                  Limpar filtros
                </Button>
              )}
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
                        {formatarDataHoraSaoPaulo(g.data_recebimento)}
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
          key={detail.id}
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
  const saveLock = useRef(false);
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
    const tiposAceitos = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    if (!tiposAceitos.has(file.type)) {
      toast.error('Use um arquivo PDF, JPG, PNG ou WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('O anexo deve ter no máximo 10 MB.');
      return;
    }
    if (!clinicaId) {
      toast.error('Clínica não identificada. Atualize a sessão e tente novamente.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${clinicaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('guias-externas').upload(path, file);
      if (error) throw error;
      const anexoAnterior = form.anexo_url;
      setForm((f) => ({ ...f, anexo_url: path, anexo_nome: file.name }));
      toast.success('Anexo enviado');
      if (anexoAnterior && anexoAnterior !== path) {
        try {
          const { error: erroRemocao } = await supabase.storage.from('guias-externas').remove([anexoAnterior]);
          if (erroRemocao) throw erroRemocao;
        } catch (erroRemocao) {
          toast.warning('O novo anexo foi enviado, mas o arquivo anterior não pôde ser removido.', {
            description: mensagemDeErro(erroRemocao),
          });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = async () => {
    if (saveLock.current || saving || uploading) return;
    if (form.anexo_url) {
      try {
        const { error } = await supabase.storage.from('guias-externas').remove([form.anexo_url]);
        if (error) toast.warning('O formulário foi fechado, mas não foi possível remover o anexo temporário.', { description: error.message });
      } catch (error) {
        toast.warning('O formulário foi fechado, mas não foi possível remover o anexo temporário.', { description: mensagemDeErro(error) });
      }
    }
    onClose();
  };

  const handleSave = async () => {
    if (uploading || saving) {
      toast.info('Aguarde o envio do anexo terminar antes de registrar a guia.');
      return;
    }
    if (saveLock.current) return;
    if (!clinicaId) { toast.error('Clínica não identificada. Atualize a sessão e tente novamente.'); return; }
    if (!form.paciente_nome.trim()) { toast.error('Nome do paciente é obrigatório'); return; }
    const cpfDigitos = form.paciente_cpf.replace(/\D/g, '');
    if (cpfDigitos && !validateCPF(cpfDigitos)) { toast.error('CPF inválido. Confira os números digitados.'); return; }
    if (form.paciente_nascimento) {
      const nascimento = /^\d{4}-\d{2}-\d{2}$/.test(form.paciente_nascimento)
        ? new Date(`${form.paciente_nascimento}T12:00:00`)
        : new Date(Number.NaN);
      const nascimentoValido = /^\d{4}-\d{2}-\d{2}$/.test(form.paciente_nascimento)
        && Number.isFinite(nascimento.getTime())
        && format(nascimento, 'yyyy-MM-dd') === form.paciente_nascimento
        && form.paciente_nascimento <= todaySaoPauloDateOnly();
      if (!nascimentoValido) { toast.error('Informe uma data de nascimento válida, que não esteja no futuro.'); return; }
    }
    const exames = form.exames_texto
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((nome) => ({ nome }));
    if (exames.length === 0) { toast.error('Liste ao menos um exame'); return; }

    saveLock.current = true;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from('guias_externas').insert({
        clinica_id: clinicaId,
        origem: 'manual',
        status: 'recebida',
        paciente_nome: form.paciente_nome.trim(),
        paciente_cpf: cpfDigitos || null,
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
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) void handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova guia externa</DialogTitle>
          <DialogDescription>Registre um pedido de exames recebido de fora da clínica.</DialogDescription>
        </DialogHeader>

        <fieldset disabled={saving || uploading} className="contents">
        <Tabs defaultValue="paciente" className="mt-2">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
            <TabsTrigger value="paciente">Paciente</TabsTrigger>
            <TabsTrigger value="medico">Médico</TabsTrigger>
            <TabsTrigger value="convenio">Convênio</TabsTrigger>
            <TabsTrigger value="exames">Exames</TabsTrigger>
          </TabsList>

          <TabsContent value="paciente" className="space-y-3 pt-3">
            <div><Label>Nome completo *</Label><Input value={form.paciente_nome} onChange={(e) => setForm({ ...form, paciente_nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={form.paciente_cpf} onChange={(e) => setForm({ ...form, paciente_cpf: formatCPF(e.target.value) })} /></div>
              <div><Label>Data nascimento</Label><Input type="date" value={form.paciente_nascimento} onChange={(e) => setForm({ ...form, paciente_nascimento: e.target.value })} /></div>
            </div>
            <div><Label>Telefone</Label><Input value={form.paciente_telefone} onChange={(e) => setForm({ ...form, paciente_telefone: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="medico" className="space-y-3 pt-3">
            <div><Label>Nome do médico solicitante</Label><Input value={form.medico_externo_nome} onChange={(e) => setForm({ ...form, medico_externo_nome: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading || saving} />
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
        </fieldset>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => void handleClose()} disabled={saving || uploading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
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
  const [terceirizacao, setTerceirizacao] = useState({
    laboratorio_id: guia.laboratorio_id || '', status_terceirizacao: guia.status_terceirizacao || 'nao_enviado',
    prazo_laboratorio: guia.prazo_laboratorio || '', custo_laboratorio: guia.custo_laboratorio == null ? '' : String(guia.custo_laboratorio),
    data_envio_laboratorio: guia.data_envio_laboratorio || '', data_retorno_laboratorio: guia.data_retorno_laboratorio || '',
    laudo_externo_url: guia.laudo_externo_url || '', laudo_externo_nome: guia.laudo_externo_nome || '',
  });
  const [uploadingRetorno, setUploadingRetorno] = useState(false);

  const laboratoriosParceiros = useQuery({
    queryKey: ['lab-parceiros-guia', profile?.clinica_id], enabled: open && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('laboratorios').select('id, nome')
        .eq('clinica_id', profile!.clinica_id).eq('ativo', true).order('nome');
      if (error) throw error; return data ?? [];
    },
  });
  const eventosTerceirizacao = useQuery({
    queryKey: ['lab-guia-eventos', guia.id, profile?.clinica_id], enabled: open && !!profile?.clinica_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('guias_externas_eventos_lab')
        .select('id, tipo, detalhes, created_at').eq('clinica_id', profile!.clinica_id).eq('guia_id', guia.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw error; return data ?? [];
    },
  });

  const salvarTerceirizacao = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const custo = terceirizacao.custo_laboratorio.trim() ? Number(terceirizacao.custo_laboratorio.replace(',', '.')) : null;
      if (custo != null && (!Number.isFinite(custo) || custo < 0)) throw new Error('Informe um custo válido, igual ou maior que zero.');
      if (terceirizacao.status_terceirizacao !== 'nao_enviado' && !terceirizacao.laboratorio_id) throw new Error('Selecione o laboratório parceiro antes de acompanhar o envio.');
      const { data, error } = await (supabase as any).from('guias_externas').update({
        laboratorio_id: terceirizacao.laboratorio_id || null, status_terceirizacao: terceirizacao.status_terceirizacao,
        prazo_laboratorio: terceirizacao.prazo_laboratorio || null, custo_laboratorio: custo,
        data_envio_laboratorio: terceirizacao.data_envio_laboratorio || null,
        data_retorno_laboratorio: terceirizacao.data_retorno_laboratorio || null,
        laudo_externo_url: terceirizacao.laudo_externo_url || null, laudo_externo_nome: terceirizacao.laudo_externo_nome || null,
      }).eq('id', guia.id).eq('clinica_id', profile.clinica_id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A guia não pertence à clínica atual ou mudou enquanto você editava.');
    },
    onSuccess: () => { onChanged(); void eventosTerceirizacao.refetch(); toast.success('Acompanhamento do laboratório externo salvo.'); },
    onError: (error: any) => toast.error('Não foi possível salvar o acompanhamento.', { description: mensagemDeErro(error) }),
  });

  const enviarLaudoParceiro = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 15 * 1024 * 1024) { toast.error('Selecione um PDF de até 15 MB.'); return; }
    if (!profile?.clinica_id) { toast.error('Clínica não identificada.'); return; }
    setUploadingRetorno(true);
    try {
      const path = `${profile.clinica_id}/retornos/${guia.id}-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from('guias-externas').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (error) throw error;
      setTerceirizacao(current => ({ ...current, laudo_externo_url: path, laudo_externo_nome: file.name }));
      toast.success('Laudo do parceiro anexado. Salve o acompanhamento para concluir.');
    } catch (error) { toast.error('Não foi possível anexar o laudo.', { description: mensagemDeErro(error) }); }
    finally { setUploadingRetorno(false); }
  };

  const abrirLaudoParceiro = async () => {
    if (!terceirizacao.laudo_externo_url) return;
    const { data, error } = await supabase.storage.from('guias-externas').createSignedUrl(terceirizacao.laudo_externo_url, 300);
    if (error || !data?.signedUrl || !abrirUrlSegura(data.signedUrl, storageUrlSeguro)) {
      toast.error('Não foi possível abrir o laudo do parceiro.', { description: error?.message }); return;
    }
  };

  const updateStatus = useMutation({
    mutationFn: async (patch: any) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('guias_externas').update(patch)
        .eq('id', guia.id).eq('clinica_id', profile.clinica_id).eq('status', guia.status).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('A guia mudou de estado ou não pertence à clínica atual. Atualize a lista.');
    },
    onSuccess: () => { onChanged(); toast.success('Atualizado'); },
    onError: (e: any) => toast.error(e.message),
  });

  const enviarParaFila = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!['recebida', 'em_analise', 'agendada'].includes(guia.status)) {
        throw new Error('Esta guia já foi encaminhada ou não aceita envio para a fila. Atualize a lista.');
      }
      const pacienteId = await obterOuCriarPacienteDaGuia(guia, profile?.clinica_id);
      const { error } = await (supabase as any).rpc('encaminhar_guia_externa_para_fila', {
        p_guia_id: guia.id,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: pacienteId,
      });
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); toast.success('Guia enviada para a fila de coleta'); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const gerarAgendamento = useMutation({
    mutationFn: async () => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada.');
      if (!['recebida', 'em_analise'].includes(guia.status)) throw new Error('Esta guia já foi agendada ou encaminhada. Atualize a lista.');
      const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(dataAg)
        && !Number.isNaN(new Date(`${dataAg}T12:00:00`).getTime())
        && format(new Date(`${dataAg}T12:00:00`), 'yyyy-MM-dd') === dataAg;
      if (!dataValida || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horaAg)) throw new Error('Informe uma data e hora válidas.');
      const pacienteId = await obterOuCriarPacienteDaGuia(guia, profile?.clinica_id);
      const { error } = await (supabase as any).rpc('agendar_guia_externa', {
        p_guia_id: guia.id,
        p_clinica_id: profile.clinica_id,
        p_paciente_id: pacienteId,
        p_data: dataAg,
        p_hora: horaAg,
      });
      if (error) throw error;
    },
    onSuccess: () => { onChanged(); toast.success('Coleta agendada'); setAgendando(false); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAnexo = async () => {
    if (!guia.anexo_url) return;
    try {
      const { data, error } = await supabase.storage
        .from('guias-externas')
        .createSignedUrl(guia.anexo_url, 300);
      if (error) throw error;
      if (!data?.signedUrl || !abrirUrlSegura(data.signedUrl, storageUrlSeguro)) {
        throw new Error('O arquivo retornou um endereço não confiável');
      }
    } catch (e) {
      toast.error('Não foi possível abrir o anexo.', { description: e instanceof Error ? e.message : String(e) });
    }
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
            Recebida em {formatarDataHoraSaoPaulo(guia.data_recebimento, true)} · {ORIGEM_LABEL[guia.origem]}
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

          <Card className="border-border/70">
            <CardHeader className="border-b bg-muted/20 py-3"><CardTitle className="text-sm">Acompanhamento do laboratório parceiro</CardTitle><CardDescription>Parceiro, prazo, custo e retorno ficam vinculados a esta guia da clínica.</CardDescription></CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Laboratório parceiro</Label><Select value={terceirizacao.laboratorio_id || '__none__'} onValueChange={(value) => setTerceirizacao(current => ({ ...current, laboratorio_id: value === '__none__' ? '' : value }))}><SelectTrigger><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger><SelectContent><SelectItem value="__none__">Não definido</SelectItem>{(laboratoriosParceiros.data ?? []).map((laboratorio: any) => <SelectItem key={laboratorio.id} value={laboratorio.id}>{laboratorio.nome}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Status do processamento externo</Label><Select value={terceirizacao.status_terceirizacao} onValueChange={(value) => setTerceirizacao(current => ({ ...current, status_terceirizacao: value, data_envio_laboratorio: value === 'enviado' && !current.data_envio_laboratorio ? new Date().toISOString() : current.data_envio_laboratorio, data_retorno_laboratorio: value === 'concluido' && !current.data_retorno_laboratorio ? new Date().toISOString() : current.data_retorno_laboratorio }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nao_enviado">Não enviado</SelectItem><SelectItem value="enviado">Enviado</SelectItem><SelectItem value="em_processamento">Em processamento</SelectItem><SelectItem value="concluido">Concluído</SelectItem><SelectItem value="atrasado">Atrasado</SelectItem></SelectContent></Select></div>
                <div className="space-y-1"><Label>Prazo previsto</Label><Input type="date" value={terceirizacao.prazo_laboratorio} onChange={(event) => setTerceirizacao(current => ({ ...current, prazo_laboratorio: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Custo do parceiro (R$)</Label><Input inputMode="decimal" value={terceirizacao.custo_laboratorio} onChange={(event) => setTerceirizacao(current => ({ ...current, custo_laboratorio: event.target.value }))} placeholder="0,00" /></div>
                <div className="space-y-1"><Label>Enviado em</Label><Input type="datetime-local" value={paraDataHoraLocal(terceirizacao.data_envio_laboratorio)} onChange={(event) => setTerceirizacao(current => ({ ...current, data_envio_laboratorio: event.target.value ? new Date(event.target.value).toISOString() : '' }))} /></div>
                <div className="space-y-1"><Label>Retornado em</Label><Input type="datetime-local" value={paraDataHoraLocal(terceirizacao.data_retorno_laboratorio)} onChange={(event) => setTerceirizacao(current => ({ ...current, data_retorno_laboratorio: event.target.value ? new Date(event.target.value).toISOString() : '' }))} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button variant="outline" size="sm" asChild={false} onClick={() => document.getElementById(`laudo-parceiro-${guia.id}`)?.click()} disabled={uploadingRetorno}>{uploadingRetorno ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}{terceirizacao.laudo_externo_nome || 'Anexar laudo PDF'}</Button>
                <input id={`laudo-parceiro-${guia.id}`} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void enviarLaudoParceiro(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                {terceirizacao.laudo_externo_url && <Button variant="ghost" size="sm" onClick={() => void abrirLaudoParceiro()}><ExternalLink className="mr-1 h-4 w-4" />Abrir PDF privado</Button>}
                <Button size="sm" className="ml-auto" onClick={() => salvarTerceirizacao.mutate()} disabled={salvarTerceirizacao.isPending || uploadingRetorno}>{salvarTerceirizacao.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Salvar acompanhamento</Button>
              </div>
              <div className="border-t pt-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de acompanhamento</p>{eventosTerceirizacao.isLoading ? <p role="status" className="text-xs text-muted-foreground">Carregando histórico…</p> : (eventosTerceirizacao.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">As atualizações feitas após a migration aparecerão aqui.</p> : <ul className="space-y-1.5">{eventosTerceirizacao.data?.map((evento: any) => <li key={evento.id} className="flex justify-between gap-3 text-xs"><span>{evento.tipo === 'parceiro_registrado' ? 'Acompanhamento iniciado' : 'Acompanhamento atualizado'}</span><time className="text-muted-foreground">{formatarDataHoraSaoPaulo(evento.created_at, true)}</time></li>)}</ul>}</div>
            </CardContent>
          </Card>

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
                  <Button variant="ghost" size="sm" onClick={() => setAgendando(false)} disabled={gerarAgendamento.isPending}>Cancelar</Button>
                  <Button size="sm" onClick={() => gerarAgendamento.mutate()} disabled={gerarAgendamento.isPending || enviarParaFila.isPending || updateStatus.isPending}>
                    {gerarAgendamento.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Confirmar agendamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="mt-4 flex-wrap gap-2">
          {guia.status !== 'cancelada' && guia.status !== 'finalizada' && guia.status !== 'encaminhada_fila' && (
            <>
              <Button variant="outline" onClick={() => updateStatus.mutate({ status: 'cancelada' })} disabled={updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending}>
                <X className="h-4 w-4 mr-1" /> Cancelar guia
              </Button>
              {!agendando && ['recebida', 'em_analise'].includes(guia.status) && (
                <Button variant="outline" onClick={() => setAgendando(true)} disabled={updateStatus.isPending || enviarParaFila.isPending || gerarAgendamento.isPending} className="gap-1.5">
                  <CalendarPlus className="h-4 w-4" /> Agendar coleta
                </Button>
              )}
              <Button onClick={() => enviarParaFila.mutate()} disabled={enviarParaFila.isPending || gerarAgendamento.isPending || updateStatus.isPending} className="gap-1.5">
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

  const { data: tokens = [], isLoading, error: tokensError, refetch: refetchTokens } = useQuery({
    queryKey: ['portal_guias_tokens', clinicaId],
    enabled: !!clinicaId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('portal_guias_tokens')
        .select('*')
        .eq('clinica_id', clinicaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const criarToken = useMutation({
    mutationFn: async () => {
      if (!clinicaId || !userId) throw new Error('Clínica ou usuário não identificado. Atualize a sessão e tente novamente.');
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
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('portal_guias_tokens').update({ ativo })
        .eq('id', id).eq('clinica_id', clinicaId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este link não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }),
    onError: (error: any) => toast.error('Não foi possível atualizar o link', { description: error.message }),
  });

  const deletarToken = useMutation({
    mutationFn: async (id: string) => {
      if (!clinicaId) throw new Error('Clínica não identificada.');
      const { data, error } = await (supabase as any).from('portal_guias_tokens').delete()
        .eq('id', id).eq('clinica_id', clinicaId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Este link não pertence à clínica atual ou já foi removido.');
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['portal_guias_tokens'] }); toast.success('Removido'); },
    onError: (error: any) => toast.error('Não foi possível remover o link', { description: error.message }),
  });

  const copiarLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar automaticamente. Selecione e copie o endereço manualmente.');
    }
  };

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
            tokensError ? <ErrorState compact error={tokensError} onRetry={() => void refetchTokens()} /> :
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
                          {t.ultimo_uso ? `Último uso: ${formatarDataHoraSaoPaulo(t.ultimo_uso)}` : 'Nunca usado'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.ativo} disabled={toggleAtivo.isPending || deletarToken.isPending} onCheckedChange={(v) => toggleAtivo.mutate({ id: t.id, ativo: v })} />
                        <Button aria-label={`Excluir link ${t.descricao || 'genérico'}`} size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={toggleAtivo.isPending || deletarToken.isPending} onClick={() => deletarToken.mutate(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={url} readOnly className="text-xs font-mono" />
                      <Button aria-label="Copiar link da guia" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => void copiarLink(url)}>
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
