import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErro } from '@/lib/erros';
import { dateOnlyInTimeZone, isValidDateOnly } from '@/lib/dateOnly';

type Stage = 'created' | 'configuration' | 'team' | 'operational' | 'completed' | 'blocked';
type ClinicOnboarding = {
  clinica_id: string;
  clinica_nome: string;
  created_at: string;
  stage: Stage;
  owner_id?: string | null;
  next_action?: string | null;
  due_at?: string | null;
  team_size: number;
  has_config: boolean;
  has_services: boolean;
  has_activity: boolean;
  readiness: number;
};
type OnboardingOwner = { user_id: string; nome: string; email: string | null; nivel: string };

const stages: Array<{ value: Stage; label: string }> = [
  { value: 'created', label: 'Criada' },
  { value: 'configuration', label: 'Configuração' },
  { value: 'team', label: 'Equipe' },
  { value: 'operational', label: 'Em operação' },
  { value: 'completed', label: 'Concluído' },
  { value: 'blocked', label: 'Bloqueado' },
];

function dateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateOnlyInTimeZone(date, 'America/Sao_Paulo');
}

function fimDoDiaSaoPaulo(value: string) {
  if (!isValidDateOnly(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const horarioLocalComoUtc = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(horarioLocalComoUtc));
  const valor = (tipo: string) => Number(partes.find((parte) => parte.type === tipo)?.value);
  const localNaRepresentacaoUtc = Date.UTC(
    valor('year'), valor('month') - 1, valor('day'), valor('hour'), valor('minute'), valor('second'), 999,
  );
  return new Date(horarioLocalComoUtc - (localNaRepresentacaoUtc - horarioLocalComoUtc)).toISOString();
}

function dueTimestamp(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export default function PlatformOnboarding() {
  const queryClient = useQueryClient();
  const [clinic, setClinic] = useState<ClinicOnboarding | null>(null);
  const [stage, setStage] = useState<Stage>('created');
  const [nextAction, setNextAction] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [ownerId, setOwnerId] = useState('unassigned');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const query = useQuery({
    queryKey: ['platform-onboarding'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('platform_onboarding_overview');
      if (error) throw error;
      return (data?.clinics || []) as ClinicOnboarding[];
    },
    refetchInterval: 60_000,
  });
  const owners = useQuery({
    queryKey: ['platform-onboarding-owners'],
    queryFn: async () => {
      const { data: admins, error } = await (supabase as any)
        .from('platform_admins').select('user_id,nivel').eq('ativo', true).order('created_at');
      if (error) throw error;
      const ids = (admins || []).map((admin: any) => admin.user_id);
      if (!ids.length) return [] as OnboardingOwner[];
      const { data: profiles, error: profilesError } = await (supabase as any)
        .from('profiles').select('id,nome,email').in('id', ids);
      if (profilesError) throw profilesError;
      const profileMap = new Map<string, any>((profiles || []).map((profile: any) => [profile.id, profile]));
      return admins.map((admin: any) => ({
        user_id: admin.user_id,
        nivel: admin.nivel,
        nome: profileMap.get(admin.user_id)?.nome || 'Administrador sem nome',
        email: profileMap.get(admin.user_id)?.email || null,
      })) as OnboardingOwner[];
    },
  });

  const openEditor = (item: ClinicOnboarding) => {
    setClinic(item);
    setStage(item.stage);
    setNextAction(item.next_action || '');
    setDueAt(dateInputValue(item.due_at));
    setOwnerId(item.owner_id || 'unassigned');
  };

  const save = async () => {
    if (saveLock.current || !clinic) return;
    if (stage !== 'completed' && nextAction.trim().length < 3) {
      toast.error(stage === 'blocked' ? 'Descreva o bloqueio ou o próximo passo necessário.' : 'Informe a próxima ação para manter o onboarding acionável.');
      return;
    }
    const prazoIso = stage === 'completed' || !dueAt ? null : fimDoDiaSaoPaulo(dueAt);
    if (dueAt && stage !== 'completed' && !prazoIso) {
      toast.error('Informe uma data válida para o acompanhamento.');
      return;
    }

    saveLock.current = true;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('platform_update_onboarding', {
        p_clinica_id: clinic.clinica_id,
        p_stage: stage,
        p_next_action: stage === 'completed' ? null : nextAction.trim() || null,
        p_due_at: prazoIso,
        p_owner_id: ownerId === 'unassigned' ? null : ownerId,
      });
      if (error) throw error;
      toast.success('Onboarding atualizado.');
      setClinic(null);
      await queryClient.invalidateQueries({ queryKey: ['platform-onboarding'] });
    } catch (error) {
      toast.error('Não foi possível atualizar o onboarding.', { description: mensagemDeErro(error) });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const clinics = [...(query.data || [])].sort((a, b) => {
    const aDue = dueTimestamp(a.due_at), bDue = dueTimestamp(b.due_at);
    const aOverdue = aDue !== null && aDue < Date.now() && a.stage !== 'completed';
    const bOverdue = bDue !== null && bDue < Date.now() && b.stage !== 'completed';
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if (aDue !== null && bDue === null) return -1;
    if (aDue === null && bDue !== null) return 1;
    return a.readiness - b.readiness || a.clinica_nome.localeCompare(b.clinica_nome, 'pt-BR');
  });
  const overdueCount = clinics.filter(item => {
    const due = dueTimestamp(item.due_at);
    return due !== null && due < Date.now() && item.stage !== 'completed';
  }).length;
  const visibleClinics = clinics.filter(item => {
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return true;
    const owner = owners.data?.find(candidate => candidate.user_id === item.owner_id);
    return `${item.clinica_nome} ${item.next_action || ''} ${owner?.nome || ''} ${owner?.email || ''}`.toLocaleLowerCase('pt-BR').includes(term);
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 />Onboarding de clínicas</h1>
          <p className="text-muted-foreground">Acompanhe prontidão, etapa, próxima ação e prazo de ativação por clínica.</p>
          {!query.isLoading && !query.isError && <p className="mt-2 text-sm text-muted-foreground">{clinics.length} clínicas ativas · {overdueCount} acompanhamentos atrasados</p>}
        </div>
        <Button variant="outline" className="min-h-11" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </header>

      {query.isLoading && <div className="space-y-3" role="status" aria-label="Carregando clínicas">{[1, 2, 3].map(item => <Skeleton key={item} className="h-40 w-full" />)}</div>}
      {query.isError && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-destructive">Não foi possível carregar os onboardings.</p>
            <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {!query.isLoading && !query.isError && query.data?.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma clínica para acompanhar.</CardContent></Card>
      )}

      {!query.isLoading && !query.isError && clinics.length > 0 && <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar clínica, responsável ou próxima ação" className="pl-9" aria-label="Buscar onboarding" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-48" aria-label="Filtrar etapa"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas as etapas</SelectItem>{stages.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>}

      <div className="space-y-3">
        {visibleClinics.map(item => (
          <Card key={item.clinica_id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{item.clinica_nome}</CardTitle>
                  <CardDescription className="mt-1">
                    Próxima ação: {item.next_action || 'Ainda não definida'}
                    {item.owner_id && ` · Responsável: ${owners.data?.find(owner => owner.user_id === item.owner_id)?.nome || 'Administrador atribuído'}`}
                    {item.due_at && ` · Prazo ${new Date(item.due_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`}
                    {item.due_at && dueTimestamp(item.due_at) !== null && dueTimestamp(item.due_at)! < Date.now() && item.stage !== 'completed' && <span className="font-medium text-destructive"> · acompanhamento atrasado</span>}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.stage === 'blocked' ? 'destructive' : item.stage === 'completed' ? 'outline' : 'secondary'}>
                    {stages.find(option => option.value === item.stage)?.label || item.stage}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => openEditor(item)}>Atualizar plano</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Progress value={Math.max(0, Math.min(100, item.readiness))} aria-label={`Checklist automático de ${item.clinica_nome}`} />
                <span className="w-10 text-right text-xs font-medium tabular-nums">{item.readiness}%</span>
              </div>
              <p className="text-xs text-muted-foreground">Checklist automático: configuração, serviços, equipe e primeiro agendamento. A etapa é atualizada pela equipe.</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {([
                  ['Configuração', item.has_config],
                  ['Serviços', item.has_services],
                  [`Equipe (${item.team_size})`, item.team_size > 1],
                  ['Primeiro uso', item.has_activity],
                ] as Array<[string, boolean]>).map(([label, done]) => (
                  <Badge key={label} variant={done ? 'outline' : 'secondary'}>{done ? '✓' : '○'} {label}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {!query.isLoading && !query.isError && clinics.length > 0 && visibleClinics.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum onboarding corresponde à busca e à etapa selecionadas.</CardContent></Card>}
      </div>

      <Dialog open={!!clinic} onOpenChange={open => { if (!open && !saving) setClinic(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plano de ativação</DialogTitle>
            <DialogDescription>{clinic?.clinica_nome}. Registre uma etapa, ação concreta e prazo para o próximo acompanhamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="onboarding-stage">Etapa</Label>
              <Select value={stage} onValueChange={value => setStage(value as Stage)} disabled={saving}>
                <SelectTrigger id="onboarding-stage"><SelectValue /></SelectTrigger>
                <SelectContent>{stages.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              {stage === 'completed' ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Ao concluir, a próxima ação e o prazo serão limpos do acompanhamento.</p>
              ) : <>
                <Label htmlFor="onboarding-next-action">{stage === 'blocked' ? 'Bloqueio ou próximo passo necessário' : 'Próxima ação'}</Label>
                <Textarea id="onboarding-next-action" value={nextAction} onChange={event => setNextAction(event.target.value)} maxLength={500} placeholder={stage === 'blocked' ? 'Ex.: aguardar envio dos dados pelo responsável da clínica' : 'Ex.: concluir cadastro de serviços com a clínica'} rows={3} disabled={saving} />
                <p className="text-xs text-muted-foreground">{nextAction.length}/500 caracteres · obrigatório, mínimo de 3.</p>
              </>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-owner">Responsável da plataforma</Label>
              <Select value={ownerId} onValueChange={setOwnerId} disabled={saving || owners.isLoading || owners.isError}>
                <SelectTrigger id="onboarding-owner"><SelectValue placeholder="Selecione um responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                  {(owners.data || []).map(owner => <SelectItem key={owner.user_id} value={owner.user_id}>{owner.nome}{owner.email ? ` · ${owner.email}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              {owners.isError && <p role="alert" className="text-xs text-destructive">Não foi possível carregar responsáveis. Tente novamente antes de atribuir.</p>}
              {owners.isError && <Button type="button" size="sm" variant="outline" onClick={() => void owners.refetch()} disabled={owners.isFetching}>Tentar carregar responsáveis</Button>}
              {!owners.isLoading && !owners.isError && ownerId !== 'unassigned' && !owners.data?.some(owner => owner.user_id === ownerId) && <p role="status" className="text-xs text-warning">O responsável salvo não está ativo. Atribua outro responsável ou selecione “Sem responsável”.</p>}
              {!owners.isLoading && !owners.isError && !owners.data?.length && <p className="text-xs text-muted-foreground">Nenhum administrador ativo disponível.</p>}
            </div>
            {stage !== 'completed' && <div className="space-y-2">
              <Label htmlFor="onboarding-due-date">Prazo para acompanhamento</Label>
              <Input id="onboarding-due-date" type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} disabled={saving} />
              <p className="text-xs text-muted-foreground">O prazo vale até 23:59, horário de São Paulo.</p>
            </div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClinic(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar acompanhamento'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
