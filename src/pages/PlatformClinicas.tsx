import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Building2, Search, Users, Stethoscope, CalendarRange, RefreshCw, Crown, LogIn, Mail, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { AcoesDaClinica } from '@/components/plataforma/AcoesDaClinica';
import { LogDeAcessos } from '@/components/plataforma/LogDeAcessos';
import { useNavigate } from 'react-router-dom';

interface ClinicaOverview {
  clinica_id: string;
  clinica_nome: string;
  owner_id: string | null;
  owner_nome: string | null;
  owner_email: string | null;
  created_at: string;
  suspensa: boolean;
  plano_slug: string | null;
  plano_nome: string | null;
  assinatura_status: string | null;
  em_trial: boolean | null;
  trial_fim: string | null;
  data_fim: string | null;
  total_medicos: number;
  total_funcionarios: number;
  total_pacientes: number;
  total_agendamentos: number;
  arquivada?: boolean;
  arquivada_em?: string | null;
  arquivada_motivo?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ativa: 'bg-success/10 text-success border-success/20',
  trial: 'bg-info/10 text-info border-info/20',
  expirada: 'bg-warning/10 text-warning border-warning/20',
  cancelada: 'bg-destructive/10 text-destructive border-destructive/20',
  pendente: 'bg-warning/10 text-warning border-warning/20',
};
const STATUS_LABELS: Record<string, string> = {
  ativa: 'Ativa', trial: 'Em teste', expirada: 'Expirada', cancelada: 'Cancelada', pendente: 'Pendente',
};

function dataFormatada(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function dataHoraFormatada(value: string | null) {
  if (!value) return 'Data indisponível';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Data indisponível'
    : parsed.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export default function PlatformClinicas() {
  const { isPlatformAdmin, isLoading: authLoading, refreshProfile } = useSupabaseAuth();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [paginaOrfaos, setPaginaOrfaos] = useState(0);
  const impersonationLock = useRef(false);
  const reconcileLock = useRef(false);
  const resendLock = useRef(false);
  const navigate = useNavigate();

  /**
   * Entrar numa clínica é ver o prontuário de paciente de um cliente. O motivo
   * é gravado em `platform_impersonation_log` e é o que transforma o registro
   * em rastro de verdade — sem ele toda linha do log fica igual.
   */
  const handleImpersonate = async () => {
    if (impersonationLock.current || !alvo) return;
    if (motivo.trim().length < 5) {
      toast.error('Descreva o motivo do acesso', {
        description: 'Fica registrado no log de auditoria da plataforma.',
      });
      return;
    }
    impersonationLock.current = true;
    setImpersonatingId(alvo.id);
    try {
      const { error } = await (supabase as any).rpc('platform_start_impersonation', {
        _target_clinica_id: alvo.id,
        _motivo: motivo.trim(),
      });
      if (error) throw error;
      await refreshProfile();
      setAlvo(null);
      setMotivo('');
      toast.success(`Entrando como ${alvo.nome}`);
      navigate('/dashboard');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao impersonar clínica');
    } finally {
      impersonationLock.current = false;
      setImpersonatingId(null);
    }
  };

  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ['platform-clinicas-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_get_clinicas_overview');
      if (error) throw error;
      return (data ?? []) as ClinicaOverview[];
    },
    enabled: isPlatformAdmin,
  });

  const { data: orfaosData, refetch: refetchOrfaos, isError: orfaosError } = useQuery({
    queryKey: ['platform-orfaos', paginaOrfaos],
    queryFn: async () => {
      const inicio = paginaOrfaos * 50;
      const { data, error, count } = await (supabase as any)
        .from('registros_pendentes')
        .select('id, nome, email, plano_slug, updated_at, reminder_count', { count: 'exact' })
        .eq('status', 'pago')
        .is('user_id', null)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + 49);
      if (error) throw error;
      return { items: data ?? [], total: count ?? inicio + (data ?? []).length };
    },
    enabled: isPlatformAdmin,
  });
  const orfaos = orfaosData?.items ?? [];
  const totalOrfaos = orfaosData?.total ?? 0;
  const paginasOrfaos = Math.max(1, Math.ceil(totalOrfaos / 50));
  useEffect(() => {
    if (paginaOrfaos >= paginasOrfaos) setPaginaOrfaos(Math.max(0, paginasOrfaos - 1));
  }, [paginaOrfaos, paginasOrfaos]);

  const handleReconcile = async () => {
    if (reconcileLock.current) return;
    reconcileLock.current = true;
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-pending-registrations');
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'A reconciliação não foi concluída.');
      const resumo = `${(data as any)?.checked ?? 0} elegíveis · ${(data as any)?.resent ?? 0} lembretes enviados · ${(data as any)?.expired ?? 0} expirados`;
      if ((data as any)?.failed) {
        toast.warning('Reconciliação concluída com falhas', { description: `${resumo} · ${(data as any).failed} e-mail(s) não enviados.` });
      } else {
        toast.success('Reconciliação concluída', { description: resumo });
      }
      await refetchOrfaos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reconciliar');
    } finally {
      reconcileLock.current = false;
      setReconciling(false);
    }
  };

  const handleResend = async (id: string, email: string) => {
    if (resendLock.current) return;
    resendLock.current = true;
    setResendingId(id);
    try {
      const { data, error: resendError } = await supabase.functions.invoke('resend-pending-registration', {
        body: { registration_id: id },
      });
      if (resendError) throw resendError;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Não foi possível reenviar o convite.');
      toast.success(`Código reenviado para ${email}`);
      await refetchOrfaos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reenviar');
    } finally {
      resendLock.current = false;
      setResendingId(null);
    }
  };

  const filtered = useMemo(() => {
    // Arquivada fica escondida por padrão: o objetivo de arquivar é justamente
    // tirar da frente. O contador ao lado do botão diz quantas estão guardadas.
    const list = (data ?? []).filter(c => mostrarArquivadas || !c.arquivada);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.clinica_nome?.toLowerCase().includes(q) ||
      c.owner_email?.toLowerCase().includes(q) ||
      c.owner_nome?.toLowerCase().includes(q) ||
      c.plano_nome?.toLowerCase().includes(q)
    );
  }, [data, search, mostrarArquivadas]);

  const totals = useMemo(() => {
    const list = data ?? [];
    const agora = Date.now();
    const validade = (clinica: ClinicaOverview) => {
      const fim = clinica.data_fim || clinica.trial_fim;
      return !fim || new Date(fim).getTime() >= agora;
    };
    return {
      clinicas: list.length,
      arquivadas: list.filter(c => c.arquivada).length,
      ativas: list.filter(c => !c.arquivada && !c.suspensa && c.assinatura_status === 'ativa' && !c.em_trial && validade(c)).length,
      trial: list.filter(c => !c.arquivada && !c.suspensa && (c.assinatura_status === 'trial' || c.em_trial) && validade(c)).length,
      pacientes: list.reduce((s, c) => s + Number(c.total_pacientes || 0), 0),
    };
  }, [data]);

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Crown className="h-7 w-7 text-primary" /> Plataforma — Clínicas
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão global de todas as clínicas, assinaturas e uso. Restrito a administradores da plataforma.
          </p>
        </div>
        <div className="flex gap-2">
          {(data ?? []).some(c => c.arquivada) && (
            <Button variant="outline" size="sm" onClick={() => setMostrarArquivadas(v => !v)}>
              {mostrarArquivadas
                ? 'Ocultar arquivadas'
                : `Ver arquivadas (${(data ?? []).filter(c => c.arquivada).length})`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {orfaosError ? (
        <Card className="border-destructive/30"><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-destructive" role="alert">Não foi possível consultar os pagamentos que aguardam ativação.</p>
          <Button size="sm" variant="outline" onClick={() => void refetchOrfaos()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : orfaos && orfaos.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <AlertCircle className="h-5 w-5" />
                Pagamentos órfãos ({orfaos.length} nesta página · {totalOrfaos} no total)
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleReconcile} disabled={reconciling}>
                <RefreshCw className={`h-4 w-4 mr-2 ${reconciling ? 'animate-spin' : ''}`} />
                Reconciliar agora
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Clientes que pagaram mas ainda não criaram a conta. Reenvie o código quando necessário.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead className="text-center">Lembretes</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orfaos.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{o.nome}</div>
                        <div className="text-xs text-muted-foreground">{o.email}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{o.plano_slug}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dataHoraFormatada(o.updated_at)}
                      </TableCell>
                      <TableCell className="text-center text-xs">{o.reminder_count ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resendingId !== null}
                          onClick={() => handleResend(o.id, o.email)}
                        >
                          <Mail className="h-3.5 w-3.5 mr-1" />
                          {resendingId === o.id ? 'Enviando...' : 'Reenviar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalOrfaos > 50 && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => setPaginaOrfaos((pagina) => Math.max(0, pagina - 1))} disabled={paginaOrfaos === 0}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />Anterior
                </Button>
                <span className="text-xs text-muted-foreground">Página {paginaOrfaos + 1} de {paginasOrfaos}</span>
                <Button size="sm" variant="outline" onClick={() => setPaginaOrfaos((pagina) => Math.min(paginasOrfaos - 1, pagina + 1))} disabled={paginaOrfaos + 1 >= paginasOrfaos}>
                  Próxima<ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" />Clínicas</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{isLoading ? '…' : totals.clinicas}</p><p className="text-xs text-muted-foreground">{totals.arquivadas} arquivada(s)</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Assinaturas Ativas</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-success">{isLoading ? '…' : totals.ativas}</p><p className="text-xs text-muted-foreground">válidas, pagas e sem suspensão</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Em Trial</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-info">{isLoading ? '…' : totals.trial}</p><p className="text-xs text-muted-foreground">em período de teste válido</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Pacientes (total)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{isLoading ? '…' : totals.pacientes}</p><p className="text-xs text-muted-foreground">inclui clínicas arquivadas</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Todas as Clínicas</CardTitle>
            <div className="relative w-72 max-w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por clínica, dono ou plano..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma clínica encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clínica</TableHead>
                    <TableHead>Dono</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center"><Stethoscope className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-center"><Users className="h-4 w-4 inline" /></TableHead>
                    <TableHead className="text-center">Pacientes</TableHead>
                    <TableHead className="text-center"><CalendarRange className="h-4 w-4 inline" /></TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.clinica_id}>
                      <TableCell className="font-medium">
                        <span className={c.arquivada ? 'text-muted-foreground line-through' : ''}>
                          {c.clinica_nome}
                        </span>
                        {c.arquivada && (
                          <Badge variant="outline" className="ml-2 text-[10px]" title={c.arquivada_motivo ?? ''}>
                            Arquivada
                          </Badge>
                        )}
                        {c.suspensa && <Badge variant="destructive" className="ml-2 text-[10px]">Acesso suspenso</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{c.owner_nome || <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-xs text-muted-foreground">{c.owner_email || '—'}</div>
                      </TableCell>
                      <TableCell>
                        {c.plano_nome ? (
                          <Badge variant="outline">{c.plano_nome}</Badge>
                        ) : <span className="text-muted-foreground text-xs">sem plano</span>}
                      </TableCell>
                      <TableCell>
                        {c.assinatura_status ? (
                          <Badge className={STATUS_COLORS[c.assinatura_status] || ''} variant="outline">
                            {STATUS_LABELS[c.assinatura_status] || c.assinatura_status}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">Sem assinatura</span>}
                        {(c.data_fim || c.trial_fim) && <div className="mt-1 text-xs text-muted-foreground">{new Date((c.data_fim || c.trial_fim)!).getTime() < Date.now() ? 'Data vencida em' : 'Vencimento'} {dataFormatada(c.data_fim || c.trial_fim)}</div>}
                      </TableCell>
                      <TableCell className="text-center">{c.total_medicos}</TableCell>
                      <TableCell className="text-center">{c.total_funcionarios}</TableCell>
                      <TableCell className="text-center">{c.total_pacientes}</TableCell>
                      <TableCell className="text-center">{c.total_agendamentos}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dataFormatada(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={impersonatingId === c.clinica_id}
                          onClick={() => { setAlvo({ id: c.clinica_id, nome: c.clinica_nome }); setMotivo(''); }}
                        >
                          <LogIn className="h-3.5 w-3.5 mr-1" />
                          {impersonatingId === c.clinica_id ? 'Entrando...' : 'Entrar'}
                        </Button>
                        <AcoesDaClinica
                          clinicaId={c.clinica_id}
                          nome={c.clinica_nome}
                          arquivada={!!c.arquivada}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <LogDeAcessos />

      <Dialog open={!!alvo} onOpenChange={aberto => { if (!aberto && !impersonationLock.current) { setAlvo(null); setMotivo(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entrar em {alvo?.nome}</DialogTitle>
            <DialogDescription>
              Você vai acessar os dados dessa clínica, inclusive prontuários de
              pacientes. O motivo fica registrado no log da plataforma, com data
              e hora de entrada e de saída.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-impersonacao">Motivo do acesso</Label>
            <Textarea
              id="motivo-impersonacao"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: chamado #142 — agenda não abre para a recepção"
              rows={3}
              disabled={!!impersonatingId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)} disabled={!!impersonatingId}>Cancelar</Button>
            <Button onClick={handleImpersonate} disabled={!!impersonatingId}>
              {impersonatingId ? 'Entrando...' : 'Entrar na clínica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
