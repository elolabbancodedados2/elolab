import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, HeartPulse, Pill, RefreshCw, ShieldAlert, TestTube } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { autorizarLeituraHistoricoPaciente } from '@/lib/prontuarioAudit';
import { formatDateTimeSaoPaulo } from '@/lib/dateOnly';
import { LIMIARES_VITAIS, classificarSinalVital, numeroVital, type NivelVital, type SinalVital } from '@/lib/limiaresVitais';

interface ClinicalSafetyPanelProps {
  pacienteId: string;
  alergias?: string[] | null;
  compact?: boolean;
}

interface VitalWarning {
  label: string;
  value: string;
  nivel: Exclude<NivelVital, 'normal'>;
}

/** Sinais medidos há mais de 24 h não descrevem o paciente de agora. */
export const JANELA_SINAIS_ATUAIS_MS = 24 * 60 * 60 * 1000;

export function getVitalWarnings(vitals: Record<string, unknown> | null | undefined): VitalWarning[] {
  if (!vitals) return [];
  const sinais: SinalVital[] = ['pressao_sistolica', 'pressao_diastolica', 'frequencia_cardiaca', 'temperatura', 'saturacao'];
  const warnings: VitalWarning[] = [];
  for (const sinal of sinais) {
    const nivel = classificarSinalVital(sinal, vitals[sinal]);
    if (!nivel || nivel === 'normal') continue;
    const limiar = LIMIARES_VITAIS[sinal];
    warnings.push({ label: limiar.rotulo, value: `${numeroVital(vitals[sinal])} ${limiar.unidade}`, nivel });
  }
  return warnings;
}

/**
 * Escolhe a medição mais recente entre a triagem e a última evolução e só a
 * considera "atual" se tiver até 24 h. Uma triagem de meses atrás aparecia
 * como sinal atual do paciente.
 */
export function escolherSinaisAtuais(
  triagem: { vitais: Record<string, unknown>; medidoEm: string } | null,
  evolucao: { vitais: Record<string, unknown>; medidoEm: string } | null,
  agora = Date.now(),
): { vitais: Record<string, unknown>; medidoEm: string; origem: 'triagem' | 'evolucao'; atual: boolean } | null {
  const candidatos = [
    triagem && { ...triagem, origem: 'triagem' as const },
    evolucao && { ...evolucao, origem: 'evolucao' as const },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item) && Number.isFinite(Date.parse(item!.medidoEm)));
  if (candidatos.length === 0) return null;
  const maisRecente = candidatos.sort((a, b) => Date.parse(b.medidoEm) - Date.parse(a.medidoEm))[0];
  return { ...maisRecente, atual: agora - Date.parse(maisRecente.medidoEm) <= JANELA_SINAIS_ATUAIS_MS };
}

function splitMedications(value?: string | null): string[] {
  if (!value) return [];
  return value.split(/[;\n,]+/).map(item => item.trim()).filter(Boolean).slice(0, 8);
}

export function ClinicalSafetyPanel({ pacienteId, alergias = [], compact = false }: ClinicalSafetyPanelProps) {
  const { user, profile } = useSupabaseAuth();
  const clinicaId = profile?.clinica_id ?? null;
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['clinical-safety-panel', user?.id ?? null, clinicaId, pacienteId],
    queryFn: async () => {
      await autorizarLeituraHistoricoPaciente(pacienteId);
      const [conditionsResult, recordResult, examsResult, triageResult] = await Promise.all([
        supabase.from('paciente_comorbidades').select('id, codigo_cid, descricao').eq('paciente_id', pacienteId).eq('ativo', true).order('data_diagnostico', { ascending: false }),
        supabase.from('prontuarios').select('medicamentos_em_uso, sinais_vitais, data, created_at').eq('paciente_id', pacienteId).eq('clinica_id', clinicaId!).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('exames').select('id, tipo_exame, status').eq('paciente_id', pacienteId).in('status', ['solicitado', 'agendado']).order('data_solicitacao', { ascending: false }).limit(8),
        supabase.from('triagens').select('pressao_arterial, frequencia_cardiaca, temperatura, saturacao, data_hora, created_at').eq('paciente_id', pacienteId).eq('clinica_id', clinicaId!).order('data_hora', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const firstError = [conditionsResult.error, recordResult.error, examsResult.error, triageResult.error].find(Boolean);
      if (firstError) throw firstError;

      const record = recordResult.data;
      const triage = triageResult.data;
      const pressure = triage?.pressao_arterial?.split('/');
      const sinais = escolherSinaisAtuais(
        triage ? {
          vitais: {
            pressao_sistolica: pressure?.[0], pressao_diastolica: pressure?.[1],
            frequencia_cardiaca: triage.frequencia_cardiaca,
            temperatura: triage.temperatura, saturacao: triage.saturacao,
          },
          medidoEm: triage.data_hora || triage.created_at,
        } : null,
        record?.sinais_vitais ? {
          vitais: record.sinais_vitais as Record<string, unknown>,
          // A evolução só tem a data clínica; usamos o registro do sistema.
          medidoEm: record.created_at || `${record.data}T12:00:00-03:00`,
        } : null,
      );

      return {
        conditions: conditionsResult.data ?? [],
        medications: splitMedications(record?.medicamentos_em_uso),
        pendingExams: examsResult.data ?? [],
        sinais,
        vitalWarnings: sinais?.atual ? getVitalWarnings(sinais.vitais) : [],
      };
    },
    enabled: Boolean(pacienteId && user && clinicaId),
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;

  // Erro não é "sem alerta": sem os dados, a tela não pode afirmar que o
  // paciente não tem risco.
  if (isError) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="space-y-2 p-3.5">
          <div role="alert" className="flex items-start gap-2 text-xs text-warning-foreground">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p><span className="font-semibold">Contexto clínico indisponível.</span> Não foi possível conferir problemas ativos, medicamentos e sinais vitais. Revise a ficha antes de prescrever.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5 text-xs sm:min-h-9" onClick={() => { void refetch(); }} disabled={isFetching}>
            <RefreshCw aria-hidden="true" className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const allergyList = alergias ?? [];
  const hasVitalAlert = Boolean(data?.vitalWarnings.some(item => item.nivel === 'alerta'));
  const hasRisk = hasVitalAlert || (!compact && allergyList.length > 0);
  const sinais = data?.sinais;
  const medicaoTexto = sinais
    ? `${sinais.origem === 'triagem' ? 'Triagem' : 'Evolução'} de ${formatDateTimeSaoPaulo(sinais.medidoEm)}`
    : null;

  return (
    <Card className={hasRisk ? 'border-destructive/40' : 'border-border/50'}>
      <CardContent className="p-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ShieldAlert aria-hidden="true" className={hasRisk ? 'h-4 w-4 text-destructive' : 'h-4 w-4 text-muted-foreground'} />
          <span className="text-xs font-bold">{compact ? 'Contexto clínico' : 'Segurança assistencial'}</span>
          <Badge variant={hasRisk ? 'destructive' : 'outline'} className="text-xs font-medium">
            {hasRisk ? 'Revisar antes de prescrever' : compact && allergyList.length > 0 ? 'Alergia sinalizada na ficha' : 'Sem alerta crítico identificado'}
          </Badge>
        </div>

        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
          {!compact && <SafetyGroup icon={AlertTriangle} title="Alergias" critical items={allergyList} empty="Não relatadas" />}
          <SafetyGroup icon={HeartPulse} title="Problemas ativos" items={(data?.conditions ?? []).map(item => `${item.codigo_cid ? `${item.codigo_cid} · ` : ''}${item.descricao}`)} empty="Nenhum registrado" />
          <SafetyGroup icon={Pill} title="Medicamentos em uso" items={data?.medications ?? []} empty="Não informados" />
          <div className="space-y-2">
            <SafetyGroup icon={TestTube} title="Exames pendentes" items={(data?.pendingExams ?? []).map(item => item.tipo_exame)} empty="Nenhum" />
            {(data?.vitalWarnings.length ?? 0) > 0 && (
              <SafetyGroup
                icon={Activity}
                title="Sinais alterados"
                critical={hasVitalAlert}
                warning={!hasVitalAlert}
                items={(data?.vitalWarnings ?? []).map(item => `${item.label}: ${item.value}`)}
                empty=""
              />
            )}
            {medicaoTexto && (
              <p className="text-xs text-muted-foreground">
                {sinais?.atual ? `Últimos sinais: ${medicaoTexto}.` : `Sem sinais nas últimas 24 h. Última medição: ${medicaoTexto}.`}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SafetyGroup({ icon: Icon, title, items, empty, critical = false, warning = false }: {
  icon: typeof AlertTriangle;
  title: string;
  items: string[];
  empty: string;
  critical?: boolean;
  warning?: boolean;
}) {
  const tomBadge = critical
    ? 'border-destructive/30 bg-destructive/10 text-destructive'
    : warning ? 'border-warning/40 bg-warning/10 text-warning-foreground' : '';
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden="true" className={critical && items.length ? 'h-3.5 w-3.5 text-destructive' : 'h-3.5 w-3.5'} />{title}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item, index) => <Badge key={`${item}-${index}`} variant="outline" className={`max-w-full truncate text-xs font-medium ${tomBadge}`}>{item}</Badge>)}
        </div>
      ) : <p className="text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}
