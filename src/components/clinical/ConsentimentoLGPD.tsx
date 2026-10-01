import { useState } from 'react';
import { format } from 'date-fns';
import { Shield, CheckCircle, XCircle, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Consentimento {
  id: string;
  tipo_consentimento: string;
  versao_termo: string;
  aceito: boolean;
  data_aceite: string | null;
  revogado: boolean;
  data_revogacao: string | null;
  motivo_revogacao: string | null;
}

interface ConsentimentoLGPDProps {
  pacienteId: string;
  pacienteNome: string;
  consentimentos: Consentimento[];
  onConsentimentoRegistrado: () => void;
}

const TIPOS_CONSENTIMENTO = [
  {
    tipo: 'tratamento_dados',
    titulo: 'Tratamento de Dados Pessoais',
    descricao: 'Autorizo o tratamento dos meus dados pessoais para fins de atendimento médico, conforme a Lei Geral de Proteção de Dados (LGPD).',
  },
  {
    tipo: 'compartilhamento_convenio',
    titulo: 'Compartilhamento com Convênio',
    descricao: 'Autorizo o compartilhamento dos meus dados com o convênio de saúde para fins de faturamento e autorização de procedimentos.',
  },
  {
    tipo: 'comunicacao_marketing',
    titulo: 'Comunicações e Marketing',
    descricao: 'Autorizo o recebimento de comunicações sobre novos serviços, lembretes de consultas e mensagens de aniversário.',
  },
];

const TERMO_LGPD = `
TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS

Em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD), este termo visa registrar a manifestação livre, informada e inequívoca do titular dos dados pessoais.

1. DADOS COLETADOS
Serão coletados dados pessoais necessários para a prestação de serviços de saúde, incluindo:
- Dados de identificação (nome, CPF, RG, data de nascimento)
- Dados de contato (telefone, e-mail, endereço)
- Dados de saúde (histórico médico, exames, prescrições)
- Dados de convênio (número da carteira, plano)

2. FINALIDADE DO TRATAMENTO
Os dados serão utilizados exclusivamente para:
- Prestação de serviços de saúde
- Agendamento e gestão de consultas
- Emissão de documentos médicos
- Faturamento e cobrança
- Comunicação sobre atendimentos

3. COMPARTILHAMENTO DE DADOS
Os dados poderão ser compartilhados com:
- Operadoras de planos de saúde (quando aplicável)
- Laboratórios e clínicas para exames
- Órgãos reguladores de saúde
- Autoridades judiciais (quando exigido por lei)

4. DIREITOS DO TITULAR
O paciente tem direito a:
- Solicitar acesso aos seus dados
- Corrigir dados incompletos ou incorretos
- Solicitar anonimização ou exclusão de dados
- Revogar este consentimento a qualquer momento

5. ARMAZENAMENTO E SEGURANÇA
Os dados são armazenados de forma segura, com acesso restrito a profissionais autorizados, pelo período mínimo exigido por lei (20 anos para prontuários médicos).

Versão do Termo: 1.0
Data de Vigência: ${format(new Date(), 'dd/MM/yyyy')}
`;

export function ConsentimentoLGPD({ 
  pacienteId, 
  pacienteNome, 
  consentimentos, 
  onConsentimentoRegistrado 
}: ConsentimentoLGPDProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [aceites, setAceites] = useState<Record<string, boolean>>({});
  const [motivoRevogacao, setMotivoRevogacao] = useState('');
  const { toast } = useToast();

  const getConsentimentoStatus = (tipo: string) => {
    const consentimento = consentimentos.find(c => c.tipo_consentimento === tipo);
    if (!consentimento) return 'pendente';
    if (consentimento.revogado) return 'revogado';
    if (consentimento.aceito) return 'aceito';
    return 'recusado';
  };

  const handleRegistrarConsentimento = async () => {
    const tiposAceitos = Object.entries(aceites).filter(([_, aceito]) => aceito).map(([tipo]) => tipo);
    
    if (tiposAceitos.length === 0) {
      toast({
        title: 'Atenção',
        description: 'Selecione pelo menos um tipo de consentimento.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const tiposPersistidos: string[] = [];
    try {
      const now = new Date().toISOString();
      
      for (const tipo of tiposAceitos) {
        // Check if already exists
        const existente = consentimentos.find(c => c.tipo_consentimento === tipo && !c.revogado);
        
        if (existente) {
          const { data, error } = await supabase
            .from('consentimentos_lgpd')
            .update({
              aceito: true,
              data_aceite: now,
              revogado: false,
              data_revogacao: null,
              motivo_revogacao: null,
            })
            .eq('id', existente.id)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Não foi possível confirmar a gravação do consentimento.');
        } else {
          const { data, error } = await supabase
            .from('consentimentos_lgpd')
            .insert({
              paciente_id: pacienteId,
              tipo_consentimento: tipo,
              versao_termo: '1.0',
              aceito: true,
              data_aceite: now,
            })
            .select('id')
            .single();
          if (error) throw error;
          if (!data) throw new Error('Não foi possível confirmar a gravação do consentimento.');
        }
        tiposPersistidos.push(tipo);
      }

      toast({
        title: 'Consentimento registrado',
        description: 'Os termos foram aceitos com sucesso.',
      });
      
      setIsOpen(false);
      setAceites({});
      onConsentimentoRegistrado();
    } catch (error) {
      console.error('Erro ao registrar consentimento:', error);
      toast({
        title: tiposPersistidos.length ? 'Registro parcial' : 'Erro',
        description: tiposPersistidos.length
          ? 'Alguns consentimentos foram registrados e já foram atualizados na lista. Confirme os itens restantes antes de continuar.'
          : 'Não foi possível registrar o consentimento. Nenhum aceite foi confirmado.',
        variant: 'destructive',
      });
      if (tiposPersistidos.length) {
        setAceites((anteriores) => Object.fromEntries(
          Object.entries(anteriores).filter(([tipo]) => !tiposPersistidos.includes(tipo)),
        ));
        onConsentimentoRegistrado();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRevogarConsentimento = async () => {
    if (!selectedTipo || !motivoRevogacao.trim()) {
      toast({
        title: 'Atenção',
        description: 'Informe o motivo da revogação.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const consentimento = consentimentos.find(
        c => c.tipo_consentimento === selectedTipo && c.aceito && !c.revogado
      );

      if (!consentimento) throw new Error('Este consentimento não está mais ativo. Atualize a lista e tente novamente.');

      const { data, error } = await supabase
        .from('consentimentos_lgpd')
        .update({
          revogado: true,
          data_revogacao: new Date().toISOString(),
          motivo_revogacao: motivoRevogacao.trim(),
        })
        .eq('id', consentimento.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Não foi possível confirmar a revogação. Atualize a lista e tente novamente.');

      toast({
        title: 'Consentimento revogado',
        description: 'A revogação foi registrada com sucesso.',
      });
      
      setIsRevokeOpen(false);
      setSelectedTipo(null);
      setMotivoRevogacao('');
      onConsentimentoRegistrado();
    } catch (error) {
      console.error('Erro ao revogar consentimento:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível revogar o consentimento.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
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
            <Button onClick={() => setIsOpen(true)} size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Novo Consentimento
            </Button>
          </div>
          <CardDescription>
            Gerencie os termos de consentimento do paciente conforme a LGPD
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!temConsentimentoObrigatorio && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Atenção:</strong> O consentimento obrigatório para tratamento de dados ainda não foi registrado.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
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
                          onClick={() => {
                            setSelectedTipo(tipo.tipo);
                            setIsRevokeOpen(true);
                          }}
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
          </div>
        </CardContent>
      </Card>

      {/* Dialog para novo consentimento */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Termo de Consentimento LGPD</DialogTitle>
            <DialogDescription>
              Paciente: <strong>{pacienteNome}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg text-sm max-h-60 overflow-y-auto whitespace-pre-line">
              {TERMO_LGPD}
            </div>

            <div className="space-y-3">
              {TIPOS_CONSENTIMENTO.map((tipo) => {
                const status = getConsentimentoStatus(tipo.tipo);
                const disabled = status === 'aceito';
                
                return (
                  <div key={tipo.tipo} className="flex items-start space-x-3">
                    <Checkbox
                      id={tipo.tipo}
                      checked={aceites[tipo.tipo] || false}
                      onCheckedChange={(checked) => 
                        setAceites({ ...aceites, [tipo.tipo]: checked as boolean })
                      }
                      disabled={disabled}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor={tipo.tipo}
                        className={disabled ? 'text-muted-foreground' : ''}
                      >
                        {tipo.titulo}
                        {tipo.tipo === 'tratamento_dados' && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                        {disabled && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Já aceito
                          </Badge>
                        )}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {tipo.descricao}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRegistrarConsentimento} disabled={loading}>
              {loading ? 'Registrando...' : 'Registrar Consentimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para revogação */}
      <Dialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar Consentimento</DialogTitle>
            <DialogDescription>
              Esta ação irá revogar o consentimento do paciente. Informe o motivo:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={motivoRevogacao}
              onChange={(e) => setMotivoRevogacao(e.target.value)}
              placeholder="Motivo da revogação..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevokeOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRevogarConsentimento} 
              disabled={loading}
            >
              {loading ? 'Revogando...' : 'Confirmar Revogação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
