/**
 * ClinicalAlertsDisplay Component
 * Exibe alertas de segurança clínica de forma visual
 */

import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClinicalAlert } from '@/lib/clinicalAlerts';

interface ClinicalAlertsDisplayProps {
  alerts: ClinicalAlert[];
  onDismiss?: (alertId: string) => void;
  compact?: boolean; // Se true, apenas conta + ícones
}

const SEVERITY_COLORS = {
  critical: 'border-red-500 bg-red-50 dark:bg-red-950/20',
  warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
  info: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
};

const SEVERITY_ICONS = {
  critical: <AlertCircle className="h-5 w-5 text-red-600" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
  info: <Info className="h-5 w-5 text-blue-600" />,
};

const SEVERITY_TEXT_COLORS = {
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  info: 'text-blue-600 dark:text-blue-400',
};

const SEVERITY_BADGE_COLORS = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export function ClinicalAlertsDisplay({
  alerts,
  onDismiss,
  compact = false,
}: ClinicalAlertsDisplayProps) {
  if (alerts.length === 0) {
    return null;
  }

  // Contar por severidade
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {criticalCount > 0 && (
          <Badge className={SEVERITY_BADGE_COLORS.critical}>
            {SEVERITY_ICONS.critical}
            <span className="ml-1">{criticalCount} crítica{criticalCount > 1 ? 's' : ''}</span>
          </Badge>
        )}
        {warningCount > 0 && (
          <Badge className={SEVERITY_BADGE_COLORS.warning}>
            {SEVERITY_ICONS.warning}
            <span className="ml-1">{warningCount} aviso{warningCount > 1 ? 's' : ''}</span>
          </Badge>
        )}
        {infoCount > 0 && (
          <Badge className={SEVERITY_BADGE_COLORS.info}>
            {SEVERITY_ICONS.info}
            <span className="ml-1">{infoCount} info</span>
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Alertas críticos primeiro */}
      {alerts
        .sort((a, b) => {
          const severityOrder = { critical: 0, warning: 1, info: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        })
        .map(alert => (
          <Alert
            key={alert.id}
            className={`relative ${SEVERITY_COLORS[alert.severity]}`}
          >
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {SEVERITY_ICONS[alert.severity]}
              </div>

              <div className="flex-1 min-w-0">
                <AlertTitle className={SEVERITY_TEXT_COLORS[alert.severity]}>
                  {alert.title}
                </AlertTitle>
                <AlertDescription className="mt-1 text-sm">
                  {alert.message}
                  {alert.action && (
                    <div className="mt-2 font-semibold text-xs">
                      💡 {alert.action}
                    </div>
                  )}
                </AlertDescription>
              </div>

              {alert.canIgnore && onDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => onDismiss(alert.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {!alert.canIgnore && alert.severity === 'critical' && (
              <div className="absolute top-2 right-2 inline-block">
                <Badge variant="destructive" className="text-xs">
                  Não ignorável
                </Badge>
              </div>
            )}
          </Alert>
        ))}

      {/* Summary badge */}
      {alerts.length > 3 && (
        <div className="text-xs text-muted-foreground text-center">
          {alerts.length} alerta{alerts.length > 1 ? 's' : ''} de segurança clínica
        </div>
      )}
    </div>
  );
}

/**
 * Hook para gerenciar alertas ignorados
 */
export function useClinicalAlerts() {
  const [ignoredAlertIds, setIgnoredAlertIds] = React.useState<Set<string>>(
    new Set()
  );

  const filterAlerts = (alerts: ClinicalAlert[]): ClinicalAlert[] => {
    return alerts.filter(alert => !ignoredAlertIds.has(alert.id));
  };

  const dismissAlert = (alertId: string) => {
    setIgnoredAlertIds(prev => new Set([...prev, alertId]));
  };

  const clearDismissed = () => {
    setIgnoredAlertIds(new Set());
  };

  return { filterAlerts, dismissAlert, clearDismissed, ignoredAlertIds };
}

import React from 'react';
