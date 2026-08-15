import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Building2, Search, Users, Stethoscope, CalendarRange, RefreshCw, Crown, LogIn, Mail, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  plano_slug: string | null;
  plano_nome: string | null;
  assinatura_status: string | null;
  em_trial: boolean | null;
  trial_fim: string | null;
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
};

export default function PlatformClinicas() {
  const { isPlatformAdmin, isLoading: authLoading, refreshProfile } = useSupabaseAuth();
  const [search, setSearch] = useState('');
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const navigate = useNavigate();

  /**
   * Entrar numa clínica é ver o prontuário de paciente de um cliente. O motivo
   * é gravado em `platform_impersonation_log` e é o que transforma o registro
   * em rastro de verdade — sem ele toda linha do log fica igual.
   */
  const handleImpersonate = async () => {
    if (!alvo) return;
    if (motivo.trim().length < 5) {
      toast.error('Descreva o motivo do acesso', {
        description: 'Fica registrado no log de auditoria da plataforma.',
      });
      return;
    }
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
      setImpersonatingId(null);
    }
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['platform-clinicas-overview'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_get_clinicas_overview');
      if (error) throw error;
      return (data ?? []) as ClinicaOverview[];
    },
    enabled: isPlatformAdmin,
  });

  const { data: orfaos, refetch: refetchOrfaos } = useQuery({
    queryKey: ['platform-orfaos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('registros_pendentes')
        .select('id, nome, email, plano_slug, codigo_convite, updated_at, reminder_count')
        .eq('status', 'pago')
        .is('user_id', null)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isPlatformAdmin,
  });

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-pending-registrations');
      if (error) throw error;
      toast.success(`Reconciliação concluída: ${(data as any)?.resent ?? 0} reenvios, ${(data as any)?.expired ?? 0} expirados`);
      refetchOrfaos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reconciliar');
    } finally {
      setReconciling(false);
    }
  };

  const handleResend = async (id: string, email: string) => {
    setResendingId(id);
    try {
      const { data, error } = await (supabase as any).rpc('resend_activation_manual', { _registro_id: id });
      if (error) throw error;
      const r = data as any;
      if (!r?.success) throw new Error(r?.error || 'Falha');
      // Trigger email through reconcile function immediately for this record
      await supabase.functions.invoke('reconcile-pending-registrations');
      toast.success(`Código reenviado para ${email}`);
      refetchOrfaos();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reenviar');
    } finally {
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
    return {
      clinicas: list.length,
      ativas: list.filter(c => c.assinatura_status === 'ativa').length,
      trial: list.filter(c => c.assinatura_status === 'trial').length,
      pacientes: list.reduce((s, c) => s + Number(c.total_pacientes || 0), 0),
    };
  }, [data]);

  if (authLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

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

      {orfaos && orfaos.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base flex items-center gap-2 text-warning">
                <AlertCircle className="h-5 w-5" />
                Pagamentos órfãos ({orfaos.length})
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
                    <TableHead>Código</TableHead>
                    <TableHead>Pago em</TableHead>
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
                      <TableCell className="font-mono text-xs">{o.codigo_convite}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(o.updated_at), "dd/MM HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-center text-xs">{o.reminder_count ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resendingId === o.id}
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
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="h-4 w-4" />Clínicas</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totals.clinicas}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Assinaturas Ativas</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-success">{totals.ativas}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Em Trial</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-info">{totals.trial}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Pacientes (total)</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totals.pacientes}</p></CardContent>
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
                            {c.assinatura_status}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell className="text-center">{c.total_medicos}</TableCell>
                      <TableCell className="text-center">{c.total_funcionarios}</TableCell>
                      <TableCell className="text-center">{c.total_pacientes}</TableCell>
                      <TableCell className="text-center">{c.total_agendamentos}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR }) : '—'}
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

      <Dialog open={!!alvo} onOpenChange={aberto => { if (!aberto) { setAlvo(null); setMotivo(''); } }}>
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
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button onClick={handleImpersonate} disabled={!!impersonatingId}>
              {impersonatingId ? 'Entrando...' : 'Entrar na clínica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}