import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, HeartPulse, Pill, ShieldAlert, TestTube } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface ClinicalSafetyPanelProps {
  pacienteId: string;
  alergias?: string[] | null;
}

interface VitalWarning {
  label: string;
  value: string;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getVitalWarnings(vitals: Record<string, unknown> | null | undefined): VitalWarning[] {
  if (!vitals) return [];
  const warnings: VitalWarning[] = [];
  const sistolica = asNumber(vitals.pressao_sistolica);
  const diastolica = asNumber(vitals.pressao_diastolica);
  const frequencia = asNumber(vitals.frequencia_cardiaca);
  const temperatura = asNumber(vitals.temperatura);
  const saturacao = asNumber(vitals.saturacao);

  if (sistolica !== null && (sistolica >= 180 || sistolica < 90)) warnings.push({ label: 'Pressão sistólica', value: `${sistolica} mmHg` });
  if (diastolica !== null && (diastolica >= 120 || diastolica < 60)) warnings.push({ label: 'Pressão diastólica', value: `${diastolica} mmHg` });
  if (frequencia !== null && (frequencia > 120 || frequencia < 50)) warnings.push({ label: 'Frequência cardíaca', value: `${frequencia} bpm` });
  if (temperatura !== null && (temperatura >= 38 || temperatura < 35)) warnings.push({ label: 'Temperatura', value: `${temperatura} °C` });
  if (saturacao !== null && saturacao < 94) warnings.push({ label: 'Saturação', value: `${saturacao}%` });
  return warnings;
}

function splitMedications(value?: string | null): string[] {
  if (!value) return [];
  return value.split(/[;\n,]+/).map(item => item.trim()).filter(Boolean).slice(0, 8);
}

export function ClinicalSafetyPanel({ pacienteId, alergias = [] }: ClinicalSafetyPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['clinical-safety-panel', pacienteId],
    queryFn: async () => {
      const [conditionsResult, recordResult, examsResult, triageResult] = await Promise.all([
        supabase.from('paciente_comorbidades').select('id, codigo_cid, descricao').eq('paciente_id', pacienteId).eq('ativo', true).order('data_diagnostico', { ascending: false }),
        supabase.from('prontuarios').select('medicamentos_em_uso, sinais_vitais, data').eq('paciente_id', pacienteId).order('data', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('exames').select('id, tipo_exame, status').eq('paciente_id', pacienteId).in('status', ['solicitado', 'agendado']).order('data_solicitacao', { ascending: false }).limit(8),
        supabase.from('triagens').select('pressao_arterial, frequencia_cardiaca, temperatura, saturacao, data_hora').eq('paciente_id', pacienteId).order('data_hora', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const firstError = [conditionsResult.error, recordResult.error, examsResult.error, triageResult.error].find(Boolean);
      if (firstError) throw firstError;

      const recordVitals = (recordResult.data?.sinais_vitais as Record<string, unknown> | null) ?? null;
      const triage = triageResult.data;
      const pressure = triage?.pressao_arterial?.split('/');
      const triageVitals = triage ? {
        pressao_sistolica: pressure?.[0], pressao_diastolica: pressure?.[1],
        frequencia_cardiaca: triage.frequencia_cardiaca,
        temperatura: triage.temperatura, saturacao: triage.saturacao,
      } : null;

      return {
        conditions: conditionsResult.data ?? [],
        medications: splitMedications(recordResult.data?.medicamentos_em_uso),
        pendingExams: examsResult.data ?? [],
        vitalWarnings: getVitalWarnings(triageVitals ?? recordVitals),
      };
    },
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;

  const allergyList = alergias ?? [];
  const hasRisk = allergyList.length > 0 || Boolean(data?.vitalWarnings.length);

  return (
    <Card className={hasRisk ? 'border-destructive/40 bg-destructive/[0.02]' : 'border-border/50'}>
      <CardContent className="p-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ShieldAlert className={hasRisk ? 'h-4 w-4 text-destructive' : 'h-4 w-4 text-success'} />
          <span className="text-xs font-bold">Segurança assistencial</span>
          <Badge variant={hasRisk ? 'destructive' : 'secondary'} className="text-[9px]">
            {hasRisk ? 'Revisar antes de prescrever' : 'Sem alerta crítico identificado'}
          </Badge>
          {isError && <span className="text-[10px] text-destructive">Não foi possível carregar todos os dados clínicos.</span>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SafetyGroup icon={AlertTriangle} title="Alergias" critical items={allergyList} empty="Não relatadas" />
          <SafetyGroup icon={HeartPulse} title="Problemas ativos" items={(data?.conditions ?? []).map(item => `${item.codigo_cid ? `${item.codigo_cid} · ` : ''}${item.descricao}`)} empty="Nenhum registrado" />
          <SafetyGroup icon={Pill} title="Medicamentos em uso" items={data?.medications ?? []} empty="Não informados" />
          <div className="space-y-2">
            <SafetyGroup icon={TestTube} title="Exames pendentes" items={(data?.pendingExams ?? []).map(item => item.tipo_exame)} empty="Nenhum" />
            {(data?.vitalWarnings.length ?? 0) > 0 && (
              <SafetyGroup icon={Activity} title="Últimos sinais alterados" critical items={(data?.vitalWarnings ?? []).map(item => `${item.label}: ${item.value}`)} empty="" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SafetyGroup({ icon: Icon, title, items, empty, critical = false }: {
  icon: typeof AlertTriangle;
  title: string;
  items: string[];
  empty: string;
  critical?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className={critical && items.length ? 'h-3.5 w-3.5 text-destructive' : 'h-3.5 w-3.5'} />{title}
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item, index) => <Badge key={`${item}-${index}`} variant={critical ? 'destructive' : 'outline'} className="max-w-full truncate text-[9px]">{item}</Badge>)}
        </div>
      ) : <p className="text-[10px] text-muted-foreground">{empty}</p>}
    </div>
  );
}
