import { formatWithDatePreference as format } from '@/lib/datePreference';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, Upload, Database, HardDrive, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { avisar as toast } from '@/lib/avisos';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Link } from 'react-router-dom';
import { 
  downloadBackup, 
  validateBackup, 
  restoreBackup, 
  getStorageStats,
  clinicaDoBackup,
  previaRestauracao,
  type BackupData,
  type PreviaRestauracao,
} from '@/lib/backup';

import { ptBR } from 'date-fns/locale';

const COLLECTION_LABELS: Record<string, string> = {
  pacientes: 'Pacientes',
  agendamentos: 'Agendamentos',
  prontuarios: 'Prontuários',
  prescricoes: 'Prescrições',
  atestados: 'Atestados',
  lancamentos: 'Lançamentos Financeiros',
  estoque: 'Itens de Estoque',
  convenios: 'Convênios',
  salas: 'Salas',
  fila_atendimento: 'Fila de Atendimento',
  templates_prescricao: 'Templates de Prescrição',
  templates_atestado: 'Templates de Atestado',
  medicos: 'Médicos',
  funcionarios: 'Funcionários',
  exames: 'Exames',
  encaminhamentos: 'Encaminhamentos',
  lista_espera: 'Lista de Espera',
};

export function BackupRestore() {
  const [stats, setStats] = useState<{ used: string; collections: Record<string, number> }>({ used: 'Carregando...', collections: {} });
  const [statsError, setStatsError] = useState(false);
  const [previewData, setPreviewData] = useState<BackupData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number; tabela: string } | null>(null);
  const [deOutraClinica, setDeOutraClinica] = useState(false);
  const [previa, setPrevia] = useState<PreviaRestauracao | null>(null);
  const [calculandoPrevia, setCalculandoPrevia] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profile } = useSupabaseAuth();

  const calcularPrevia = async (backup: BackupData) => {
    setPrevia(null);
    setErroPrevia(null);
    setCalculandoPrevia(true);
    try {
      setPrevia(await previaRestauracao(backup));
    } catch {
      setErroPrevia('Não foi possível calcular o que será alterado. Tente conferir novamente antes de restaurar.');
    } finally {
      setCalculandoPrevia(false);
    }
  };

  const cancelarPrevia = () => {
    setShowPreview(false);
    setPreviewData(null);
    setPrevia(null);
    setErroPrevia(null);
    setDeOutraClinica(false);
    setOverwrite(true);
  };

  const carregarEstatisticas = useCallback(async () => {
    try {
      setStats(await getStorageStats());
      setStatsError(false);
    } catch {
      setStats({ used: 'Indisponível', collections: {} });
      setStatsError(true);
    }
  }, []);

  useEffect(() => { void carregarEstatisticas(); }, [carregarEstatisticas]);

  const handleDownload = async () => {
    setDownloading(true);
    setProgresso(null);
    try {
      const { backup } = await downloadBackup((feitas, total, tabela) =>
        setProgresso({ feitas, total, tabela }),
      );

      // "Backup criado com sucesso" num arquivo pela metade é a mentira mais
      // cara deste sistema: só se descobre no dia de restaurar.
      if (!backup.completo) {
        const falhas = backup.metadata.tabelasComFalha;
        const cortadas = backup.metadata.tabelasTruncadas;
        toast({
          title: 'Backup INCOMPLETO — o arquivo saiu com "PARCIAL" no nome',
          description: [
            falhas.length ? `Não consegui ler: ${falhas.slice(0, 3).join('; ')}${falhas.length > 3 ? ` e mais ${falhas.length - 3}` : ''}.` : '',
            cortadas.length ? `Cortadas no limite: ${cortadas.join(', ')}.` : '',
            'Não use este arquivo como backup único.',
          ].filter(Boolean).join(' '),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Backup completo baixado',
          description: `${backup.metadata.totalRecords.toLocaleString('pt-BR')} registros de ${backup.metadata.tablesCount} tabelas.`,
        });
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao criar backup',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
      setProgresso(null);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const validation = validateBackup(data);
        
        if (!validation.valid) {
          toast({
            title: 'Erro no arquivo',
            description: validation.error,
            variant: 'destructive',
          });
          return;
        }

        const b = validation.backup!;
        setPreviewData(b);
        setShowPreview(true);

        // Restaurar backup da clínica errada é o engano mais fácil de cometer
        // e o mais caro de desfazer — os dois arquivos têm o mesmo nome.
        const origem = clinicaDoBackup(b);
        setDeOutraClinica(!!origem && !!profile?.clinica_id && origem !== profile.clinica_id);

        // "Isso vai criar ou vai sobrescrever?" é a pergunta que decide se
        // restaurar é seguro, e ela precisa ser respondida ANTES do clique.
        void calcularPrevia(b);

        if (!b.completo) {
          toast({
            title: 'Este backup está incompleto',
            description: b.metadata.tabelasComFalha.length
              ? `Faltam dados de: ${b.metadata.tabelasComFalha.map(f => f.split(':')[0]).join(', ')}.`
              : 'Alguma tabela foi cortada no limite quando o arquivo foi gerado.',
            variant: 'destructive',
          });
        }
      } catch {
        toast({
          title: 'Erro ao ler arquivo',
          description: 'O arquivo não é um JSON válido.',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!previewData || !previa || calculandoPrevia || erroPrevia) return;
    
    setRestoring(true);
    try {
      const result = await restoreBackup(previewData, overwrite, profile?.clinica_id ?? null);

      setShowPreview(false);
      await carregarEstatisticas();

      if (result.success) {
        toast({
          title: 'Backup restaurado',
          description: [
            `${result.restored.toLocaleString('pt-BR')} registros em ${result.porTabela.length} tabelas.`,
            result.remapeadas > 0 ? `${result.remapeadas.toLocaleString('pt-BR')} vieram de outra clínica e foram trazidos para a sua.` : '',
            result.puladas.length > 0 ? `Não restauradas (contas, papéis e auditoria): ${result.puladas.join(', ')}.` : '',
          ].filter(Boolean).join(' '),
        });
      } else {
        // Restauração parcial deixa o banco num estado que ninguém consegue
        // avaliar de fora. Dizer quais tabelas falharam é o mínimo.
        toast({
          title: `Restauração parcial — ${result.falhas.length} tabela(s) falharam`,
          description: `${result.restored.toLocaleString('pt-BR')} registros entraram. Falhou: ${result.falhas.slice(0, 3).join('; ')}${result.falhas.length > 3 ? ` e mais ${result.falhas.length - 3}` : ''}.`,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Erro ao restaurar backup',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-28 sm:px-6 sm:pb-8">
      <PageHeader
        title={showPreview && previewData ? 'Conferir restauração' : 'Backup e recuperação'}
        description={showPreview && previewData
          ? 'Revise a origem, a integridade e o impacto deste arquivo antes de gravar dados.'
          : 'Exporte os dados da clínica ou revise um arquivo antes de restaurá-lo.'}
        icon={<Database />}
        actions={showPreview && previewData
          ? <Button type="button" variant="outline" onClick={cancelarPrevia}><ArrowLeft className="mr-2 h-4 w-4" />Escolher outro arquivo</Button>
          : <Button variant="outline" asChild><Link to="/configuracoes?tab=backup"><ArrowLeft className="mr-2 h-4 w-4" />Voltar às configurações</Link></Button>}
      />

      {!showPreview || !previewData ? <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Fazer Backup
            </CardTitle>
            <CardDescription>
              Todas as 78 tabelas da clínica em um arquivo JSON — inclui
              pagamentos, triagem, anexos de prontuário e a trilha de LGPD.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span>{stats.used}</span>
            </div>
            <Button onClick={handleDownload} className="w-full" disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? 'Exportando...' : 'Baixar Backup'}
            </Button>
            {progresso && (
              // São 78 tabelas: sem isto o botão fica "Exportando..." por um
              // minuto e a pessoa acha que travou e recarrega a página.
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((progresso.feitas / progresso.total) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {progresso.feitas} de {progresso.total} tabelas
                  {progresso.tabela ? ` · ${progresso.tabela}` : ''}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Restore */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restaurar Backup
            </CardTitle>
            <CardDescription>
              Carregue um arquivo de backup para restaurar os dados no Supabase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="mr-2 h-4 w-4" />
              Selecionar Arquivo
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Current Data Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Dados Atuais no Supabase
          </CardTitle>
          <CardDescription>
            Resumo dos registros armazenados no banco de dados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsError && <p role="status" className="mb-3 text-sm text-warning">Os totais atuais estão indisponíveis. <Button type="button" variant="link" className="h-auto p-0" onClick={() => void carregarEstatisticas()}>Tentar novamente</Button></p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(stats.collections)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([collection, count]) => (
                <div key={collection} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">{COLLECTION_LABELS[collection] || collection}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      </> : (
      <Card>
        <CardHeader>
          <CardTitle>Pré-visualização do Backup</CardTitle>
          <CardDescription>Confira os dados e as alterações previstas. Nenhum registro é gravado até você confirmar a restauração.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {deOutraClinica && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm">
                <p className="font-semibold text-warning">Este backup é de outra clínica</p>
                <p className="mt-1 text-muted-foreground">Os dados vão entrar na clínica atual — pacientes, agendamentos e financeiro do arquivo passam a ser seus. Se isso não for intencional, escolha outro arquivo.</p>
              </div>
            </div>
          )}

          {!previewData.completo && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-sm">
                <p className="font-semibold text-destructive">Arquivo incompleto</p>
                <p className="mt-1 text-muted-foreground">Ele foi gerado com falha em alguma tabela. Restaurar traz o que tem, mas não devolve o que ficou de fora.</p>
              </div>
            </div>
          )}

          {calculandoPrevia && <p role="status" aria-busy="true" className="text-sm text-muted-foreground">Conferindo o que vai mudar…</p>}

          {erroPrevia && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{erroPrevia}</p>
              <Button type="button" variant="outline" onClick={() => void calcularPrevia(previewData)} disabled={calculandoPrevia}>Conferir novamente</Button>
            </div>
          )}

          {previa && (
            <section aria-labelledby="backup-impacto-heading" className="space-y-4">
              <div>
                <h2 id="backup-impacto-heading" className="font-semibold">Impacto previsto</h2>
                <p className="text-sm text-muted-foreground">A comparação é feita com os dados atuais desta clínica.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="text-2xl font-bold tabular-nums text-success">{previa.novos.toLocaleString('pt-BR')}</p>
                  <p className="text-sm text-muted-foreground">registros novos</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className={`text-2xl font-bold tabular-nums ${previa.sobrescritos > 0 && overwrite ? 'text-warning' : ''}`}>{previa.sobrescritos.toLocaleString('pt-BR')}</p>
                  <p className="text-sm text-muted-foreground">registros existentes {overwrite ? 'que serão atualizados' : 'que serão mantidos'}</p>
                </div>
              </div>
              {previa.sobrescritos > 0 && overwrite && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  Um backup antigo fará estes {previa.sobrescritos.toLocaleString('pt-BR')} registros voltarem ao estado em que estavam quando o arquivo foi criado. Desative a substituição para adicionar apenas registros novos.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Grupo de dados</TableHead><TableHead>Novos</TableHead><TableHead>Existentes</TableHead></TableRow></TableHeader>
                  <TableBody>{previa.porTabela.map(t => <TableRow key={t.tabela}>
                    <TableCell className="font-medium">{COLLECTION_LABELS[t.tabela] ?? t.tabela}</TableCell>
                    <TableCell className="tabular-nums">{t.novos}</TableCell>
                    <TableCell className="tabular-nums">{t.sobrescritos}</TableCell>
                  </TableRow>)}</TableBody>
                </Table>
              </div>
            </section>
          )}

          {previa && previa.puladas.length > 0 && <p role="note" className="rounded-lg border border-info/30 bg-info/5 p-3 text-sm text-muted-foreground">
            Estes grupos protegidos serão ignorados: {previa.puladas.map(tabela => COLLECTION_LABELS[tabela] ?? tabela).join(', ')}. Contas, papéis e trilhas de auditoria não são reescritos com dados antigos.
          </p>}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3"><dt className="text-sm text-muted-foreground">Data do backup</dt><dd className="mt-1 font-medium">{format(new Date(previewData.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-sm text-muted-foreground">Total de registros</dt><dd className="mt-1 font-medium">{previewData.metadata.totalRecords.toLocaleString('pt-BR')}</dd></div>
          </dl>

          <section aria-labelledby="backup-conteudo-heading">
            <h2 id="backup-conteudo-heading" className="mb-2 font-semibold">Conteúdo do arquivo</h2>
            <div className="divide-y rounded-lg border">
              {Object.entries(previewData.metadata.collectionCounts)
                .filter(([, count]) => count > 0)
                .map(([collection, count]) => {
                  const protegida = previa?.puladas.includes(collection) ?? false;
                  return (
                  <div key={collection} className="flex items-center justify-between gap-3 p-3">
                    <span className="text-sm">{COLLECTION_LABELS[collection] || collection}</span>
                    <Badge variant={protegida ? 'outline' : 'secondary'} className="shrink-0">{count.toLocaleString('pt-BR')} registro{count === 1 ? '' : 's'}{protegida ? count === 1 ? ' · ignorado' : ' · ignorados' : ''}</Badge>
                  </div>
                );})}
            </div>
          </section>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label htmlFor="overwrite">Substituir dados existentes</Label>
                <Switch id="overwrite" checked={overwrite} onCheckedChange={setOverwrite} />
              </div>
              <p className="text-sm text-muted-foreground">{overwrite ? 'Registros com o mesmo identificador serão atualizados.' : 'Registros atuais serão mantidos; apenas novos serão adicionados.'}</p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={cancelarPrevia} disabled={restoring}>Escolher outro arquivo</Button>
            <Button
              variant={overwrite ? 'destructive' : 'default'}
              onClick={handleRestore}
              disabled={restoring || calculandoPrevia || !!erroPrevia || !previa}
            >
              {restoring ? 'Restaurando…' : <><CheckCircle className="mr-2 h-4 w-4" />Restaurar Backup</>}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </main>
  );
}
