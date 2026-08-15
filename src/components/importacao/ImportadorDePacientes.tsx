/**
 * Trazer a base de pacientes de outro sistema.
 *
 * Quatro passos, e nenhum deles pede que a pessoa entenda o banco: sobe o
 * arquivo, confere o que o sistema adivinhou, vê o que vai acontecer, importa.
 *
 * O passo 3 existe para que ninguém descubra depois: antes de gravar qualquer
 * coisa a tela diz quantos entram, quantos são repetidos e quantos têm erro.
 * Migração é operação de uma vez só — desfazer depois é muito mais caro que
 * conferir antes.
 */
import { useState } from 'react';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2,
  AlertTriangle, Loader2, Download, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { lerArquivo, type Planilha } from '@/lib/importacao/planilha';
import { CAMPOS_PACIENTE, type NomeDoCampo } from '@/lib/importacao/campos';
import { mapearAutomaticamente, faltandoObrigatorios, type Mapeamento } from '@/lib/importacao/mapeamento';
import { converterLinha, marcarDuplicadas, resumir, podeImportar, type LinhaConvertida } from '@/lib/importacao/linhas';
import { carregarExistentes, importarPacientes, csvDasRecusadas, type ResultadoImportacao } from '@/lib/importacao/importar';

const SEM_CAMPO = '__nenhum__';

export function ImportadorDePacientes() {
  const { profile } = useSupabaseAuth();
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [planilha, setPlanilha] = useState<Planilha | null>(null);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  const [linhas, setLinhas] = useState<LinhaConvertida[]>([]);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  function reiniciar() {
    setPasso(1); setArquivo(null); setPlanilha(null);
    setMapeamento({}); setLinhas([]); setResultado(null); setProgresso(null);
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;

    setOcupado(true);
    try {
      const p = await lerArquivo(f);
      if (p.cabecalhos.length === 0 || p.linhas.length === 0) {
        toast.error('A planilha está vazia', {
          description: 'Confira se a primeira linha tem os nomes das colunas.',
        });
        return;
      }
      setArquivo(f);
      setPlanilha(p);
      setMapeamento(mapearAutomaticamente(p.cabecalhos));
      setPasso(2);
    } catch (err: any) {
      toast.error('Não consegui ler o arquivo', { description: err?.message });
    } finally {
      setOcupado(false);
    }
  }

  async function conferir() {
    if (!planilha) return;
    const faltando = faltandoObrigatorios(mapeamento);
    if (faltando.length > 0) {
      toast.error(`Falta apontar: ${faltando.join(', ')}`, {
        description: 'Sem isso não dá para saber de quem é cada linha.',
      });
      return;
    }

    setOcupado(true);
    try {
      // +2: a linha 1 é o cabeçalho, e o Excel conta a partir de 1.
      const convertidas = planilha.linhas.map((l, i) => converterLinha(l, mapeamento, i + 2));
      const existentes = await carregarExistentes(profile!.clinica_id!);
      setLinhas(marcarDuplicadas(convertidas, existentes));
      setPasso(3);
    } catch (err: any) {
      toast.error('Não consegui conferir com os pacientes atuais', { description: err?.message });
    } finally {
      setOcupado(false);
    }
  }

  async function importar() {
    setOcupado(true);
    setProgresso({ feitas: 0, total: resumo.prontas });
    try {
      const r = await importarPacientes(linhas, profile!.clinica_id!, (feitas, total) =>
        setProgresso({ feitas, total }),
      );
      setResultado(r);
      setPasso(4);
      if (r.falhas.length === 0) {
        toast.success(`${r.inseridos} paciente(s) importado(s)`);
      } else {
        toast.warning(`${r.inseridos} importado(s), ${r.falhas.length} recusado(s)`);
      }
    } catch (err: any) {
      toast.error('A importação parou', { description: err?.message });
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  }

  function baixarRecusadas() {
    const csv = csvDasRecusadas(linhas, resultado?.falhas ?? []);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nao-importados-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const resumo = resumir(linhas);
  const amostra = planilha?.linhas.slice(0, 3) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Trazer pacientes de outro sistema
        </CardTitle>
        <CardDescription>
          Planilha .csv, .xlsx ou .xls exportada da Feegow, iClinic, Ninsaúde ou
          do Excel. O sistema adivinha as colunas e você confere antes de gravar.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ─── 1. Arquivo ─── */}
        {passo === 1 && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center transition-colors hover:bg-accent/40">
            {ocupado
              ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              : <Upload className="h-8 w-8 text-muted-foreground" />}
            <span className="text-sm font-medium">
              {ocupado ? 'Lendo o arquivo…' : 'Escolher planilha'}
            </span>
            <span className="text-xs text-muted-foreground">
              A primeira linha precisa ter os nomes das colunas
            </span>
            <input
              type="file" className="sr-only" accept=".csv,.xlsx,.xls,.txt"
              onChange={aoEscolherArquivo} disabled={ocupado}
            />
          </label>
        )}

        {/* ─── 2. Colunas ─── */}
        {passo === 2 && planilha && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{arquivo?.name}</span>
              <Badge variant="secondary">{planilha.linhas.length} linhas</Badge>
              {planilha.aba && <Badge variant="outline">aba {planilha.aba}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Confira o que cada coluna virou. O que estiver como "não importar"
              é descartado — não atrapalha o resto.
            </p>

            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {planilha.cabecalhos.map((cabecalho, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border/50 p-2 sm:grid-cols-[1fr_auto_14rem]">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{cabecalho || `(coluna ${i + 1})`}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {amostra.map(l => l[i]).filter(Boolean).slice(0, 2).join(' · ') || '—'}
                    </p>
                  </div>
                  <ArrowRight className="hidden h-3 w-3 text-muted-foreground sm:block" />
                  <Select
                    value={mapeamento[i] ?? SEM_CAMPO}
                    onValueChange={v =>
                      setMapeamento(m => ({ ...m, [i]: v === SEM_CAMPO ? null : (v as NomeDoCampo) }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CAMPO}>Não importar</SelectItem>
                      {CAMPOS_PACIENTE.map(c => (
                        <SelectItem key={c.nome} value={c.nome}>
                          {c.rotulo}{c.obrigatorio ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={reiniciar}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Trocar arquivo
              </Button>
              <Button onClick={conferir} disabled={ocupado}>
                {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Conferir
              </Button>
            </div>
          </div>
        )}

        {/* ─── 3. O que vai acontecer ─── */}
        {passo === 3 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { rotulo: 'Vão entrar', valor: resumo.prontas, cor: 'text-success' },
                { rotulo: 'Já cadastrados', valor: resumo.duplicadas, cor: 'text-muted-foreground' },
                { rotulo: 'Com erro', valor: resumo.comErro, cor: 'text-destructive' },
                { rotulo: 'Com aviso', valor: resumo.comAviso, cor: 'text-warning' },
              ].map(c => (
                <div key={c.rotulo} className="rounded-lg border border-border/50 p-3">
                  <p className={`text-2xl font-bold tabular-nums ${c.cor}`}>{c.valor}</p>
                  <p className="text-[11px] text-muted-foreground">{c.rotulo}</p>
                </div>
              ))}
            </div>

            {(resumo.comErro > 0 || resumo.duplicadas > 0) && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/50 p-2">
                {linhas
                  .filter(l => !podeImportar(l) || l.duplicadaDe)
                  .slice(0, 40)
                  .map(l => (
                    <div key={l.linha} className="flex items-start gap-2 text-[11px]">
                      <Badge variant="outline" className="shrink-0 tabular-nums">L{l.linha}</Badge>
                      <span className="min-w-0 flex-1 truncate">
                        {l.paciente.nome || '(sem nome)'}
                      </span>
                      <span className={`shrink-0 ${l.duplicadaDe ? 'text-muted-foreground' : 'text-destructive'}`}>
                        {l.duplicadaDe ?? l.erros.join(' / ')}
                      </span>
                    </div>
                  ))}
                {linhas.filter(l => !podeImportar(l) || l.duplicadaDe).length > 40 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    …e mais {linhas.filter(l => !podeImportar(l) || l.duplicadaDe).length - 40}.
                    A lista completa sai em CSV no fim.
                  </p>
                )}
              </div>
            )}

            {resumo.prontas === 0 && (
              <p className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                Nenhuma linha nova para importar.
              </p>
            )}

            {progresso && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all"
                       style={{ width: `${Math.round((progresso.feitas / Math.max(1, progresso.total)) * 100)}%` }} />
                </div>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {progresso.feitas} de {progresso.total}
                </p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPasso(2)} disabled={ocupado}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <Button onClick={importar} disabled={ocupado || resumo.prontas === 0}>
                {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Importar {resumo.prontas} paciente{resumo.prontas === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── 4. Resultado ─── */}
        {passo === 4 && resultado && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {resultado.falhas.length === 0
                ? <CheckCircle2 className="h-5 w-5 text-success" />
                : <AlertTriangle className="h-5 w-5 text-warning" />}
              <p className="text-sm font-medium">
                {resultado.inseridos} paciente(s) importado(s)
                {resultado.ignorados > 0 && ` · ${resultado.ignorados} não entraram`}
              </p>
            </div>

            {resultado.falhas.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                {resultado.falhas.slice(0, 30).map(f => (
                  <div key={f.linha} className="flex items-start gap-2 text-[11px]">
                    <Badge variant="outline" className="shrink-0 tabular-nums">L{f.linha}</Badge>
                    <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                    <span className="shrink-0 text-destructive">{f.erro}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(resultado.ignorados > 0 || resultado.falhas.length > 0) && (
                <Button variant="outline" onClick={baixarRecusadas}>
                  <Download className="mr-1 h-4 w-4" />
                  Baixar os que não entraram
                </Button>
              )}
              <Button onClick={reiniciar}>Importar outra planilha</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Corrija o CSV baixado e suba de novo: quem já entrou é reconhecido
              pelo CPF e não duplica.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
