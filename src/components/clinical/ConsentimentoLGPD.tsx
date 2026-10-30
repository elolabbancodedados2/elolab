import { formatWithDatePreference as format } from '@/lib/datePreference';
import { Shield, CheckCircle, XCircle, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type Consentimento, TIPOS_CONSENTIMENTO } from '@/lib/patientConsent';

interface ConsentimentoLGPDProps {
  consentimentos: Consentimento[];
  onNovoConsentimento: () => void;
  onRevogarConsentimento: (tipo: string) => void;
  isLoading?: boolean;
  isError?: boolean;
}

export function ConsentimentoLGPD({ 
  consentimentos, 
  onNovoConsentimento,
  onRevogarConsentimento,
  isLoading = false,
  isError = false,
}: ConsentimentoLGPDProps) {
  const getConsentimentoStatus = (tipo: string) => {
    const consentimento = consentimentos.find(c => c.tipo_consentimento === tipo);
    if (!consentimento) return 'pendente';
    if (consentimento.revogado) return 'revogado';
    if (consentimento.aceito) return 'aceito';
    return 'recusado';
  };

  const temConsentimentoObrigatorio = consentimentos.some(
    c => c.tipo_consentimento === 'tratamento_dados' && c.aceito && !c.revogado
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Consentimentos LGPD</CardTitle>
            </div>
            <Button onClick={onNovoConsentimento} size="sm" disabled={isLoading || isError}>
              <FileText className="h-4 w-4 mr-2" />
              Novo Consentimento
            </Button>
          </div>
          <CardDescription>
            Gerencie os termos de consentimento do paciente conforme a LGPD
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p role="status" className="mb-4 text-sm text-muted-foreground">Carregando histórico de consentimentos…</p>}
          {isError && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Não foi possível carregar o histórico. Atualize a ficha antes de registrar ou revogar consentimentos.</AlertDescription>
            </Alert>
          )}
          {!isLoading && !isError && !temConsentimentoObrigatorio && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Atenção:</strong> O consentimento obrigatório para tratamento de dados ainda não foi registrado.
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !isError && <div className="space-y-3">
            {TIPOS_CONSENTIMENTO.map((tipo) => {
              const status = getConsentimentoStatus(tipo.tipo);
              const consentimento = consentimentos.find(c => c.tipo_consentimento === tipo.tipo);
              
              return (
                <div 
                  key={tipo.tipo}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{tipo.titulo}</p>
                    {consentimento?.data_aceite && status === 'aceito' && (
                      <p className="text-xs text-muted-foreground">
                        Aceito em: {format(new Date(consentimento.data_aceite), 'dd/MM/yyyy HH:mm')}
                      </p>
                    )}
                    {consentimento?.data_revogacao && status === 'revogado' && (
                      <p className="text-xs text-muted-foreground">
                        Revogado em: {format(new Date(consentimento.data_revogacao), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'aceito' && (
                      <>
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Aceito
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRevogarConsentimento(tipo.tipo)}
                        >
                          Revogar
                        </Button>
                      </>
                    )}
                    {status === 'revogado' && (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Revogado
                      </Badge>
                    )}
                    {status === 'pendente' && (
                      <Badge variant="secondary">Pendente</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>}
        </CardContent>
      </Card>

    </div>
  );
}
