import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AllergyAlertProps {
  alergias: string[];
  className?: string;
  compact?: boolean;
}

export function AllergyAlert({ alergias, className, compact = false }: AllergyAlertProps) {
  if (!alergias || alergias.length === 0) return null;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 flex-wrap", className)}>
        <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
        <span className="text-xs font-medium text-destructive">Alergias:</span>
        {alergias.map((alergia, index) => (
          <Badge 
            key={index} 
            variant="destructive" 
            className="text-xs animate-pulse"
          >
            {alergia}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Alert variant="destructive" className={cn("border-2", className)}>
      <AlertTriangle className="h-5 w-5 animate-pulse" />
      <AlertTitle className="font-bold flex items-center gap-2">
        ALERTA DE ALERGIAS
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-wrap gap-2 mt-2">
          {alergias.map((alergia, index) => (
            <Badge 
              key={index} 
              variant="outline" 
              className="bg-destructive/10 text-destructive border-destructive font-semibold text-sm px-3 py-1"
            >
              {alergia}
            </Badge>
          ))}
        </div>
        <p className="text-xs mt-2 opacity-80">
          Verifique contraindicações antes de prescrever medicamentos.
        </p>
      </AlertDescription>
    </Alert>
  );
}
