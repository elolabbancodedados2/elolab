import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Shield, Check, X, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface DrugInteractionCheckerProps {
  medicamentos: string[];
  alergias: string[];
  className?: string;
  onDismiss?: () => void;
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
  onDismiss,
}: DrugInteractionCheckerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);

  const interactions = useMemo(() => {
    const found: Interaction[] = [];
    const normalizedMeds = medicamentos.map(m => m.toLowerCase().trim());
    const normalizedAllergies = alergias.map(a => a.toLowerCase().trim());

    // Check drug-allergy interactions
    normalizedMeds.forEach(med => {
      const relatedAllergies = DRUG_ALLERGY_MAP[med] || [];
      
      normalizedAllergies.forEach(allergy => {
        // Direct match or related allergy
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

    // Check drug-drug interactions
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
  const hasMediumSeverity = interactions.some(i => i.severity === 'media');

  if (interactions.length === 0) {
    return null;
  }

  const getSeverityColor = (severity: 'alta' | 'media' | 'baixa') => {
    switch (severity) {
      case 'alta': return 'bg-red-500';
      case 'media': return 'bg-amber-500';
      case 'baixa': return 'bg-blue-500';
    }
  };

  const getSeverityBadge = (severity: 'alta' | 'media' | 'baixa') => {
    switch (severity) {
      case 'alta': return <Badge variant="destructive">Alta</Badge>;
      case 'media': return <Badge className="bg-amber-500 text-white">Média</Badge>;
      case 'baixa': return <Badge variant="secondary">Baixa</Badge>;
    }
  };

  return (
    <>
      <Alert 
        variant={hasHighSeverity ? 'destructive' : 'default'} 
        className={cn("border-2", className)}
      >
        <AlertTriangle className="h-5 w-5" />
        <AlertTitle className="font-bold flex items-center gap-2">
          {hasHighSeverity ? 'ALERTA DE INTERAÇÃO CRÍTICA' : 'Alertas de interação'}
        </AlertTitle>
        <AlertDescription>
          <div className="mt-2 space-y-2">
            {interactions.slice(0, 3).map((interaction, index) => (
              <div 
                key={index} 
                className="flex items-start gap-2 p-2 rounded bg-background/50 cursor-pointer hover:bg-background/80"
                onClick={() => {
                  setSelectedInteraction(interaction);
                  setShowDetails(true);
                }}
              >
                <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", getSeverityColor(interaction.severity))} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {interaction.type === 'alergia' ? (
                      <>Alergia: {interaction.drug1}</>
                    ) : (
                      <>{interaction.drug1} + {interaction.drug2}</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{interaction.message}</p>
                </div>
              </div>
            ))}
            
            {interactions.length > 3 && (
              <Button 
                variant="link" 
                size="sm" 
                className="p-0 h-auto"
                onClick={() => setShowDetails(true)}
              >
                Ver mais {interactions.length - 3} alerta(s)
              </Button>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDetails(true)}
            >
              <Info className="h-4 w-4 mr-2" />
              Ver Detalhes
            </Button>
            {onDismiss && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onDismiss}
              >
                Ciente, continuar
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Detalhes das Interações
            </DialogTitle>
            <DialogDescription>
              Foram encontradas {interactions.length} interação(ões) potencial(is)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {interactions.map((interaction, index) => (
              <div 
                key={index} 
                className={cn(
                  "p-4 rounded-lg border-2",
                  interaction.severity === 'alta' && "border-red-300 bg-red-50",
                  interaction.severity === 'media' && "border-amber-300 bg-amber-50",
                  interaction.severity === 'baixa' && "border-blue-300 bg-blue-50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">
                    {interaction.type === 'alergia' ? (
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        Alergia: {interaction.drug1}
                      </span>
                    ) : (
                      <>{interaction.drug1} + {interaction.drug2}</>
                    )}
                  </span>
                  {getSeverityBadge(interaction.severity)}
                </div>
                
                <p className="text-sm mb-2">{interaction.message}</p>
                
                <div className="text-sm p-2 bg-background/50 rounded">
                  <strong>Recomendação:</strong> {interaction.recommendation}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
