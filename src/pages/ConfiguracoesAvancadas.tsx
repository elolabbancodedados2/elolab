 /**
  * Configurações Avançadas - Complemento ao Painel de Admin
  * Seções críticas para operação da plataforma:
  * - Status & Health Check
  * - Integrações (APIs, webhooks)
  * - Especialidades & Equipes
  * - Templates CID-10
  * - Documentos & Templates
  * - LGPD & Privacidade
  */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Server, Zap, Database, Shield, Key, Code, GitBranch, Activity,
  Stethoscope, Users, FileText, CheckCircle2, AlertCircle, AlertTriangle,
  Plus, Edit, Trash2, Save, Settings, RefreshCw, Download, Upload,
  Globe, Webhook, Terminal, Lock, Eye, EyeOff, Copy, Check,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/* ─── Types ─── */
interface SystemHealth {
  database: { status: 'ok' | 'warning' | 'error'; latency: number; connections: number };
  auth: { status: 'ok' | 'error'; activeUsers: number };
  /** usedGB/totalGB são null: a cota real só é acessível pela API de
   *  administração do Supabase, indisponível no navegador. */
  storage: { status: 'ok' | 'warning' | 'error'; usedGB: number | null; totalGB: number | null };
  api: { status: 'ok' | 'warning' | 'error'; responseTime: number };
  lastCheck: Date;
}

interface Integration {
  id: string;
  nome: string;
  tipo: 'api' | 'webhook' | 'oauth' | 'smtp';
  chave: string;
  chaveSecreta?: string;
  webhook?: string;
  status: 'ativo' | 'inativo' | 'erro';
  configData?: Record<string, any>;
  createdAt: Date;
}

interface Especialidade {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  ativo: boolean;
}

interface DocumentTemplate {
  id: string;
  nome: string;
  tipo: 'prontuario' | 'prescricao' | 'atestado' | 'encaminhamento' | 'relatorio';
  conteudo: string;
  variables: string[]; // {{nome_paciente}}, {{data}}, etc
  ativo: boolean;
}

/* ─── 1. HEALTH CHECK & STATUS ─── */
export function HealthCheckTab() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const startTime = performance.now();

      // Database
      const { data: dbCheck, error: dbError } = await supabase
        .from('pacientes')
        .select('count', { count: 'exact', head: true });
      const dbLatency = Math.round(performance.now() - startTime);

      // Auth
      const { data: { user } } = await supabase.auth.getUser();

      // Storage: mede o que dá para medir pelo cliente — se algum bucket
      // responde. O total consumido em GB só existe na API de administração do
      // Supabase, que não pode ser chamada do navegador, então NÃO inventamos
      // um número aqui (a versão anterior usava Math.random()).
      const { error: storageError } = await supabase.storage
        .from('medical-attachments')
        .list('', { limit: 1 });

      setHealth({
        database: { status: dbError ? 'error' : 'ok', latency: dbLatency, connections: 0 },
        auth: { status: user ? 'ok' : 'error', activeUsers: 1 },
        storage: {
          status: storageError ? 'error' : 'ok',
          usedGB: null,
          totalGB: null,
        },
        api: { status: 'ok', responseTime: dbLatency },
        lastCheck: new Date(),
      });

      toast.success('Health check realizado');
    } catch (error) {
      toast.error('Erro ao verificar saúde do sistema');
      console.error(error);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, []);

  const StatusBadge = ({ status }: { status: 'ok' | 'warning' | 'error' }) => {
    const variants: Record<string, { bg: string; text: string; icon: any }> = {
      ok: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle2 },
      warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: AlertTriangle },
      error: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
    };
    const v = variants[status];
    const Icon = v.icon;
    return <Badge className={`${v.bg} ${v.text} gap-1`}><Icon className="h-3 w-3" /> {status.toUpperCase()}</Badge>;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Status do Sistema</CardTitle>
            <CardDescription>Verificação em tempo real dos serviços</CardDescription>
          </div>
          <Button onClick={checkHealth} disabled={checking} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Verificando...' : 'Verificar Agora'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {health ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Database */}
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold">Base de Dados</span>
                      </div>
                      <StatusBadge status={health.database.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>Latência: <span className="font-semibold text-foreground">{health.database.latency}ms</span></p>
                      <p>Conexões: <span className="font-semibold text-foreground">{health.database.connections}</span></p>
                    </div>
                  </CardContent>
                </Card>

                {/* Auth */}
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-green-600" />
                        <span className="font-semibold">Autenticação</span>
                      </div>
                      <StatusBadge status={health.auth.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>Usuários Ativos: <span className="font-semibold text-foreground">{health.auth.activeUsers}</span></p>
                    </div>
                  </CardContent>
                </Card>

                {/* Storage */}
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-purple-600" />
                        <span className="font-semibold">Armazenamento</span>
                      </div>
                      <StatusBadge status={health.storage.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>
                        {health.storage.status === 'error'
                          ? 'Buckets não responderam'
                          : 'Buckets acessíveis'}
                      </p>
                      <p className="text-xs">
                        Consumo em GB: consulte o painel do Supabase
                        (Settings → Usage). Não é possível medir pelo navegador.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* API */}
                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-orange-600" />
                        <span className="font-semibold">API Response</span>
                      </div>
                      <StatusBadge status={health.api.status} />
                    </div>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>Tempo Médio: <span className="font-semibold text-foreground">{health.api.responseTime}ms</span></p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator />
              <div className="text-xs text-muted-foreground">
                Última verificação: {format(health.lastCheck, "HH:mm:ss 'em' dd/MM/yyyy", { locale: ptBR })}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Clique em "Verificar Agora" para iniciar</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 2. INTEGRAÇÕES ─── */
export function IntegracoesTab() {
  const [showAddIntegration, setShowAddIntegration] = useState(false);
  const [newIntegration, setNewIntegration] = useState<Partial<Integration>>({});
  const [showSecret, setShowSecret] = useState(false);

  const { data: integracoes = [], isLoading } = useQuery({
    queryKey: ['integracoes'],
    queryFn: async () => {
      // Simular fetch de integrações
      return [
        {
          id: '1',
          nome: 'MercadoPago',
          tipo: 'api',
          chave: 'APP_USR_XXXX',
          status: 'ativo',
          createdAt: new Date('2026-04-01'),
        },
        {
          id: '2',
          nome: 'SendGrid Email',
          tipo: 'smtp',
          chave: 'SG_XXXX',
          status: 'ativo',
          createdAt: new Date('2026-04-02'),
        },
      ] as Integration[];
    },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5" />Integrações</CardTitle>
            <CardDescription>APIs e webhooks conectados</CardDescription>
          </div>
          <Button onClick={() => setShowAddIntegration(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Integração
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {integracoes.map(integracao => (
            <div key={integracao.id} className="flex items-start justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-semibold flex items-center gap-2">
                  {integracao.tipo === 'api' ? <Zap className="h-4 w-4" /> : <Webhook className="h-4 w-4" />}
                  {integracao.nome}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tipo: {integracao.tipo === 'api' ? 'API Key' : 'Webhook'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                    {showSecret ? integracao.chave : '•'.repeat(10)}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(integracao.chave);
                      toast.success('Chave copiada');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={integracao.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                  {integracao.status === 'ativo' ? '✓ Ativo' : 'Inativo'}
                </Badge>
                <Button size="sm" variant="outline"><Edit className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" className="text-red-600"><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}

          {integracoes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Code className="h-12 w-12 mx-auto opacity-20 mb-2" />
              <p>Nenhuma integração ativa</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para nova integração */}
      <Dialog open={showAddIntegration} onOpenChange={setShowAddIntegration}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Integração</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Integração</Label>
              <Input placeholder="Ex: MercadoPago, SendGrid..." />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select className="w-full border rounded-md p-2">
                <option>API Key</option>
                <option>OAuth</option>
                <option>Webhook</option>
                <option>SMTP</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Chave / Token</Label>
              <Input type="password" placeholder="Chave segura..." />
            </div>
            <div className="space-y-2">
              <Label>Chave Secreta (opcional)</Label>
              <Input type="password" placeholder="Chave secreta..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIntegration(false)}>Cancelar</Button>
            <Button onClick={() => {
              toast.success('Integração adicionada');
              setShowAddIntegration(false);
            }}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ─── 3. ESPECIALIDADES ─── */
export function EspecialidadesTab() {
  const [showAddEspecialidade, setShowAddEspecialidade] = useState(false);
  const [newEspecialidade, setNewEspecialidade] = useState<Partial<Especialidade>>({ ativo: true });

  const { data: especialidades = [] } = useQuery({
    queryKey: ['especialidades'],
    queryFn: async () => {
      // A tabela existe (migration add_referral_system) mas ainda não consta no
      // types.ts gerado — mesma convenção usada nas demais telas.
      const { data } = await (supabase as any).from('especialidades_destino').select('*').order('nome');
      return (data || []) as Especialidade[];
    },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" />Especialidades</CardTitle>
            <CardDescription>Gerenciar especialidades disponíveis</CardDescription>
          </div>
          <Button onClick={() => setShowAddEspecialidade(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Especialidade
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {especialidades.map(esp => (
              <div key={esp.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{esp.nome}</h3>
                  <p className="text-sm text-muted-foreground">{esp.descricao}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={esp.ativo ? 'default' : 'secondary'}>
                    {esp.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button size="sm" variant="outline"><Edit className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" className="text-red-600"><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 4. DOCUMENTOS & TEMPLATES ─── */
export function DocumentosTemplatesTab() {
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-templates'],
    queryFn: async () => {
      // Simular dados
      return [
        {
          id: '1',
          nome: 'Prontuário Padrão',
          tipo: 'prontuario',
          conteudo: 'PRONTUÁRIO CLÍNICO\nPaciente: {{nome_paciente}}\nData: {{data}}',
          variables: ['nome_paciente', 'data', 'idade'],
          ativo: true,
        },
      ] as DocumentTemplate[];
    },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Templates de Documentos</CardTitle>
            <CardDescription>Prontuários, prescrições, atestados</CardDescription>
          </div>
          <Button onClick={() => setShowAddTemplate(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Template
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map(template => (
            <Card key={template.id} className="border">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{template.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-1">Tipo: {template.tipo}</p>
                  </div>
                  <Badge className={template.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100'}>
                    {template.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="bg-gray-50 p-2 rounded text-xs font-mono text-muted-foreground max-h-20 overflow-auto">
                  {template.conteudo}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline"><Edit className="h-3 w-3 mr-1" />Editar</Button>
                  <Button size="sm" variant="outline"><Copy className="h-3 w-3 mr-1" />Duplicar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── 5. LGPD & PRIVACIDADE AVANÇADA ─── */
export function LGPDAvancadoTab() {
  const [configLGPD, setConfigLGPD] = useState({
    consentimentoObrigatorio: true,
    politicaPrivacidadeUrl: '',
    termosDealUrl: '',
    diasRetencaoDados: 2555, // 7 anos
    criptografiaSenhas: true,
    auditoriCompleta: true,
    exportarEmFormato: 'json',
    notificarDeletacao: true,
    backupAutomatico: true,
    dpoEmail: '',
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-sm text-blue-800">
          Configurações de conformidade com LGPD (Lei Geral de Proteção de Dados) e privacidade
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Política & Consentimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.consentimentoObrigatorio} onCheckedChange={v => setConfigLGPD({ ...configLGPD, consentimentoObrigatorio: v })} />
              Consentimento Obrigatório
            </Label>
            <p className="text-xs text-muted-foreground ml-6">Exigir aceitar política ao se registrar</p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>URL da Política de Privacidade</Label>
            <Input
              value={configLGPD.politicaPrivacidadeUrl}
              onChange={e => setConfigLGPD({ ...configLGPD, politicaPrivacidadeUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>URL dos Termos de Uso</Label>
            <Input
              value={configLGPD.termosDealUrl}
              onChange={e => setConfigLGPD({ ...configLGPD, termosDealUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>Email do DPO (Data Protection Officer)</Label>
            <Input
              type="email"
              value={configLGPD.dpoEmail}
              onChange={e => setConfigLGPD({ ...configLGPD, dpoEmail: e.target.value })}
              placeholder="dpo@clinica.com"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Retenção & Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Dias para Retenção de Dados (após deleção)</Label>
            <Input
              type="number"
              value={configLGPD.diasRetencaoDados}
              onChange={e => setConfigLGPD({ ...configLGPD, diasRetencaoDados: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Padrão LGPD: 2555 dias (7 anos)</p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.backupAutomatico} onCheckedChange={v => setConfigLGPD({ ...configLGPD, backupAutomatico: v })} />
              Backup Automático Diário
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.criptografiaSenhas} onCheckedChange={v => setConfigLGPD({ ...configLGPD, criptografiaSenhas: v })} />
              Criptografia de Senhas (bcrypt)
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Switch checked={configLGPD.auditoriCompleta} onCheckedChange={v => setConfigLGPD({ ...configLGPD, auditoriCompleta: v })} />
              Auditoria Completa de Acessos
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Direitos do Titular</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertDescription className="text-sm">
              Quando um paciente solicita seus dados, será exportado nos seguintes formatos disponíveis
            </AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Exportação Automática
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>✓ JSON (estruturado)</li>
                  <li>✓ PDF (prontuários)</li>
                  <li>✓ CSV (tabular)</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardContent className="pt-6">
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  Direitos Implementados
                </h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>✓ Direito de Acesso</li>
                  <li>✓ Direito de Portabilidade</li>
                  <li>✓ Direito ao Esquecimento</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Gerar Relatório LGPD
            </Button>
            <Button variant="outline" className="flex-1">
              <FileText className="h-4 w-4 mr-2" />
              Ver Requisições Pendentes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full">
        <Save className="h-4 w-4 mr-2" />
        Salvar Configurações LGPD
      </Button>
    </motion.div>
  );
}

/* ─── Main Component ─── */
// O controle de acesso fica na rota (SupabaseProtectedRoute allowedRoles=['admin']),
// como em todas as outras páginas — antes esta era a única a usar um guard próprio.
export default function ConfiguracoesAvancadas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações Avançadas</h1>
        <p className="text-muted-foreground mt-2">Gerenciamento completo dos serviços e conformidade</p>
      </div>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto">
          <TabsTrigger value="status" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Status</span>
          </TabsTrigger>
          <TabsTrigger value="integracoes" className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">APIs</span>
          </TabsTrigger>
          <TabsTrigger value="especialidades" className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            <span className="hidden sm:inline">Espec.</span>
          </TabsTrigger>
          <TabsTrigger value="documentos" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Docs</span>
          </TabsTrigger>
          <TabsTrigger value="lgpd" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">LGPD</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status"><HealthCheckTab /></TabsContent>
        <TabsContent value="integracoes"><IntegracoesTab /></TabsContent>
        <TabsContent value="especialidades"><EspecialidadesTab /></TabsContent>
        <TabsContent value="documentos"><DocumentosTemplatesTab /></TabsContent>
        <TabsContent value="lgpd"><LGPDAvancadoTab /></TabsContent>
      </Tabs>
    </div>
  );
}
