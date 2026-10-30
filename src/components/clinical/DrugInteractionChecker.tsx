import { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, Info, Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

interface DrugInteractionCheckerProps {
  medicamentos: string[];
  alergias: string[];
  className?: string;
  fullPage?: boolean;
  patientName?: string;
  loadError?: unknown;
  onOpenReview?: () => void;
  onCloseReview?: () => void;
  onRetry?: () => void;
}

interface Interaction {
  type: 'alergia' | 'interacao' | 'contraindicacao';
  severity: 'alta' | 'media' | 'baixa';
  drug1: string;
  drug2?: string;
  message: string;
  recommendation: string;
}

// Common drug-allergy relationships (simplified for demo)
const DRUG_ALLERGY_MAP: Record<string, string[]> = {
  // Penicilinas e derivados
  'amoxicilina': ['penicilina', 'ampicilina', 'amoxicilina', 'cefalosporinas'],
  'ampicilina': ['penicilina', 'amoxicilina', 'ampicilina', 'cefalosporinas'],
  'penicilina': ['penicilina', 'amoxicilina', 'ampicilina'],
  'cefalexina': ['cefalosporinas', 'penicilina'],
  'ceftriaxona': ['cefalosporinas', 'penicilina'],
  
  // AINEs
  'dipirona': ['dipirona', 'metamizol', 'aines', 'anti-inflamatórios'],
  'ibuprofeno': ['aines', 'anti-inflamatórios', 'ibuprofeno', 'aas'],
  'diclofenaco': ['aines', 'anti-inflamatórios', 'diclofenaco'],
  'nimesulida': ['aines', 'anti-inflamatórios', 'nimesulida', 'sulfonamidas'],
  'aas': ['aines', 'aspirina', 'aas', 'salicilatos'],
  'aspirina': ['aines', 'aspirina', 'aas', 'salicilatos'],
  
  // Sulfonamidas
  'sulfametoxazol': ['sulfonamidas', 'sulfa', 'bactrim'],
  'bactrim': ['sulfonamidas', 'sulfa', 'sulfametoxazol'],
  
  // Outros
  'paracetamol': ['paracetamol', 'acetaminofeno'],
  'tramadol': ['opioides', 'tramadol'],
  'codeina': ['opioides', 'codeína'],
  'morfina': ['opioides', 'morfina'],
};

// Common drug-drug interactions (simplified)
const DRUG_INTERACTIONS: { drugs: string[]; severity: 'alta' | 'media' | 'baixa'; message: string; recommendation: string }[] = [
  {
    drugs: ['varfarina', 'aas'],
    severity: 'alta',
    message: 'Risco aumentado de sangramento',
    recommendation: 'Evitar uso concomitante ou monitorar INR frequentemente',
  },
  {
    drugs: ['varfarina', 'ibuprofeno'],
    severity: 'alta',
    message: 'Risco aumentado de sangramento gastrointestinal',
    recommendation: 'Considerar alternativa analgésica como paracetamol',
  },
  {
    drugs: ['metformina', 'contraste iodado'],
    severity: 'alta',
    message: 'Risco de acidose lática',
    recommendation: 'Suspender metformina 48h antes e após uso de contraste',
  },
  {
    drugs: ['enalapril', 'espironolactona'],
    severity: 'media',
    message: 'Risco de hipercalemia',
    recommendation: 'Monitorar níveis de potássio sérico',
  },
  {
    drugs: ['losartana', 'espironolactona'],
    severity: 'media',
    message: 'Risco de hipercalemia',
    recommendation: 'Monitorar níveis de potássio sérico',
  },
  {
    drugs: ['sinvastatina', 'amiodarona'],
    severity: 'alta',
    message: 'Risco aumentado de miopatia/rabdomiólise',
    recommendation: 'Limitar dose de sinvastatina a 20mg/dia',
  },
  {
    drugs: ['fluoxetina', 'tramadol'],
    severity: 'alta',
    message: 'Risco de síndrome serotoninérgica',
    recommendation: 'Evitar uso concomitante ou monitorar sinais de síndrome serotoninérgica',
  },
  {
    drugs: ['omeprazol', 'clopidogrel'],
    severity: 'media',
    message: 'Redução da eficácia do clopidogrel',
    recommendation: 'Considerar pantoprazol como alternativa',
  },
  {
    drugs: ['ciprofloxacino', 'teofilina'],
    severity: 'media',
    message: 'Aumento dos níveis de teofilina',
    recommendation: 'Monitorar níveis de teofilina e ajustar dose',
  },
  {
    drugs: ['digoxina', 'amiodarona'],
    severity: 'alta',
    message: 'Aumento dos níveis de digoxina',
    recommendation: 'Reduzir dose de digoxina em 50%',
  },
];

export function DrugInteractionChecker({
  medicamentos,
  alergias,
  className,
  fullPage = false,
  patientName,
  loadError,
  onOpenReview,
  onCloseReview,
  onRetry,
}: DrugInteractionCheckerProps) {
  const interactions = useMemo(() => {
    const found: Interaction[] = [];
    const normalizedMeds = medicamentos.map(m => m.toLowerCase().trim());
    const normalizedAllergies = alergias.map(a => a.toLowerCase().trim());

    normalizedMeds.forEach(med => {
      const relatedAllergies = DRUG_ALLERGY_MAP[med] || [];
      normalizedAllergies.forEach(allergy => {
        if (med.includes(allergy) || allergy.includes(med) || relatedAllergies.some(ra => allergy.includes(ra) || ra.includes(allergy))) {
          found.push({
            type: 'alergia',
            severity: 'alta',
            drug1: med,
            message: `Paciente tem alergia conhecida a "${allergy}"`,
            recommendation: 'NÃO PRESCREVER este medicamento. Considerar alternativas.',
          });
        }
      });
    });

    DRUG_INTERACTIONS.forEach(interaction => {
      const matchingDrugs = interaction.drugs.filter(d =>
        normalizedMeds.some(m => m.includes(d) || d.includes(m))
      );
      if (matchingDrugs.length >= 2) {
        found.push({
          type: 'interacao',
          severity: interaction.severity,
          drug1: matchingDrugs[0],
          drug2: matchingDrugs[1],
          message: interaction.message,
          recommendation: interaction.recommendation,
        });
      }
    });
    return found;
  }, [medicamentos, alergias]);

  const hasHighSeverity = interactions.some(i => i.severity === 'alta');
  const getSeverityBadge = (severity: Interaction['severity']) => {
    switch (severity) {
      case 'alta': return <Badge variant="destructive">Alta</Badge>;
      case 'media': return <Badge className="bg-warning/15 text-warning">Média</Badge>;
      case 'baixa': return <Badge variant="secondary">Baixa</Badge>;
    }
  };
  const interactionName = (interaction: Interaction) => interaction.type === 'alergia'
    ? `Alergia: ${interaction.drug1}`
    : `${interaction.drug1} + ${interaction.drug2}`;
  const safetyNote = 'As regras locais são simplificadas e não abrangem todos os medicamentos, doses, condições clínicas ou fontes atualizadas. A ausência de alertas não confirma ausência de risco. Revise os dados e valide qualquer decisão com o profissional responsável e referências farmacológicas atualizadas.';

  if (fullPage) {
    return (
      <section className={cn('mx-auto w-full max-w-5xl space-y-5 pb-24 md:pb-0', className)} data-testid="drug-interaction-review-page">
        <PageHeader
          title="Alertas de medicamentos"
          description={patientName ? `Revisão da prescrição de ${patientName}.` : 'Revisão da prescrição atual.'}
          icon={<Shield />}
          actions={(
            <Button variant="outline" className="min-h-10" onClick={onCloseReview}>
              <ArrowLeft className="mr-2 h-4 w-4" />Voltar à prescrição
            </Button>
          )}
        />

        <div role="note" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-6 text-foreground">
          {safetyNote}
        </div>

        {loadError ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Não foi possível carregar as prescrições</h2>
              <p className="mt-1 text-sm text-muted-foreground">Nenhuma conclusão sobre os medicamentos pode ser exibida enquanto esses dados não forem carregados.</p>
            </div>
            {onRetry && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}
          </div>
        ) : medicamentos.length === 0 ? (
          <div role="status" className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold">Não há medicamentos carregados</h2>
            <p className="mt-1 text-sm text-muted-foreground">Volte à prescrição para revisar os dados disponíveis. Isso não representa uma avaliação de interação.</p>
          </div>
        ) : interactions.length === 0 ? (
          <div role="status" className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold">Nenhum alerta encontrado pelas regras locais</h2>
            <p className="mt-1 text-sm text-muted-foreground">Foram analisados {medicamentos.length} medicamento(s) carregado(s). A cobertura é limitada; consulte o aviso acima antes de interpretar este resultado.</p>
          </div>
        ) : (
          <section aria-label="Alertas encontrados" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-semibold">{interactions.length} possível(is) alerta(s)</h2>
                <p className="text-sm text-muted-foreground">Resultado das regras locais aplicadas aos dados carregados.</p>
              </div>
              <Badge variant={hasHighSeverity ? 'destructive' : 'secondary'}>{hasHighSeverity ? 'Revisão prioritária' : 'Revisão necessária'}</Badge>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {interactions.map((interaction, index) => (
                <li key={`${interaction.type}-${interaction.drug1}-${interaction.drug2 || index}`} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', interaction.severity === 'alta' ? 'text-destructive' : interaction.severity === 'media' ? 'text-warning' : 'text-info')} aria-hidden="true" />
                      <div className="min-w-0">
                        <h3 className="font-semibold">{interactionName(interaction)}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{interaction.message}</p>
                      </div>
                    </div>
                    {getSeverityBadge(interaction.severity)}
                  </div>
                  <p className="ml-8 mt-3 rounded-md bg-muted/50 p-3 text-sm leading-6">
                    <strong>Texto associado à regra local:</strong> {interaction.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    );
  }

  if (interactions.length === 0) return null;

  return (
    <Alert variant={hasHighSeverity ? 'destructive' : 'default'} className={cn('border', className)}>
      <AlertTriangle className="h-5 w-5" />
      <AlertTitle className="flex items-center gap-2 font-semibold">
        {hasHighSeverity ? 'Possíveis alertas de medicamentos' : 'Alertas de medicamentos'}
        <Badge variant={hasHighSeverity ? 'destructive' : 'secondary'}>{interactions.length}</Badge>
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-2">
          {interactions.slice(0, 3).map((interaction, index) => (
            <li key={`${interaction.type}-${interaction.drug1}-${interaction.drug2 || index}`} className="flex items-start gap-2 rounded bg-background/50 p-2">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', interaction.severity === 'alta' ? 'bg-destructive' : interaction.severity === 'media' ? 'bg-warning' : 'bg-info')} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{interactionName(interaction)}</span>
                <span className="block truncate text-xs text-muted-foreground">{interaction.message}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">Regras locais limitadas; a ausência de alerta não confirma ausência de risco.</p>
        <Button
          id="drug-interaction-review-trigger"
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-10"
          onClick={onOpenReview}
          aria-label={`Ver todos os ${interactions.length} alertas de medicamentos`}
        >
          <Info className="mr-2 h-4 w-4" />Ver todos os alertas
        </Button>
      </AlertDescription>
    </Alert>
  );
}
