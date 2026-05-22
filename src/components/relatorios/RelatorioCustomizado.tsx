import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Filter, Download, Printer, Loader2, FileSpreadsheet, RefreshCw, Star, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useMedicos, useConvenios } from '@/hooks/useSupabaseData';
import { exportToExcel } from '@/lib/excelExporter';
import { toast } from 'sonner';

type DatasetKey =
  | 'pacientes' | 'agendamentos' | 'lancamentos' | 'exames'
  | 'prescricoes' | 'atestados' | 'prontuarios' | 'estoque' | 'encaminhamentos';

interface ColumnDef {
  key: string;        // accessor (supports dot notation for joins)
  label: string;
  format?: 'date' | 'datetime' | 'currency' | 'boolean' | 'text';
}

interface DatasetConfig {
  label: string;
  table: string;
  select: string;
  dateField: string;
  statusField?: string;
  statusOptions?: string[];
  medicoField?: string;
  convenioField?: string;
  textSearchFields?: string[];
  columns: ColumnDef[];
  groupByOptions?: { key: string; label: string }[];
}

const DATASETS: Record<DatasetKey, DatasetConfig> = {
  pacientes: {
    label: 'Pacientes',
    table: 'pacientes',
    select: 'id, nome, nome_social, cpf, data_nascimento, sexo, telefone, email, cidade, estado, convenio_id, ativo, created_at, convenios(nome)',
    dateField: 'created_at',
    statusField: 'ativo',
    statusOptions: ['true', 'false'],
    convenioField: 'convenio_id',
    textSearchFields: ['nome', 'nome_social', 'cpf', 'email', 'telefone'],
    columns: [
      { key: 'nome', label: 'Nome' },
      { key: 'nome_social', label: 'Nome Social' },
      { key: 'cpf', label: 'CPF' },
      { key: 'data_nascimento', label: 'Nascimento', format: 'date' },
      { key: 'sexo', label: 'Sexo' },
      { key: 'telefone', label: 'Telefone' },
      { key: 'email', label: 'E-mail' },
      { key: 'cidade', label: 'Cidade' },
      { key: 'estado', label: 'UF' },
      { key: 'convenios.nome', label: 'Convênio' },
      { key: 'ativo', label: 'Ativo', format: 'boolean' },
      { key: 'created_at', label: 'Cadastro', format: 'datetime' },
    ],
  },
  agendamentos: {
    label: 'Agendamentos',
    table: 'agendamentos',
    select: 'id, data, hora_inicio, hora_fim, tipo, status, observacoes, paciente_id, medico_id, pacientes(nome), medicos(nome)',
    dateField: 'data',
    statusField: 'status',
    statusOptions: ['agendado', 'confirmado', 'em_atendimento', 'finalizado', 'cancelado', 'faltou'],
    medicoField: 'medico_id',
    textSearchFields: ['observacoes', 'tipo'],
    columns: [
      { key: 'data', label: 'Data', format: 'date' },
      { key: 'hora_inicio', label: 'Hora' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'medicos.nome', label: 'Médico' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'observacoes', label: 'Observações' },
    ],
    groupByOptions: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'medicos.nome', label: 'Médico' },
    ],
  },
  lancamentos: {
    label: 'Financeiro (Lançamentos)',
    table: 'lancamentos',
    select: 'id, tipo, categoria, descricao, valor, data, data_vencimento, data_pagamento, status, forma_pagamento, paciente_id, pacientes(nome)',
    dateField: 'data',
    statusField: 'status',
    statusOptions: ['pendente', 'pago', 'atrasado', 'cancelado'],
    textSearchFields: ['descricao', 'categoria'],
    columns: [
      { key: 'data', label: 'Data', format: 'date' },
      { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
      { key: 'data_pagamento', label: 'Pagamento', format: 'date' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'descricao', label: 'Descrição' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'forma_pagamento', label: 'Forma' },
      { key: 'status', label: 'Status' },
      { key: 'valor', label: 'Valor', format: 'currency' },
    ],
    groupByOptions: [
      { key: 'categoria', label: 'Categoria' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'forma_pagamento', label: 'Forma de pagamento' },
    ],
  },
  exames: {
    label: 'Exames',
    table: 'exames',
    select: 'id, tipo_exame, status, data_solicitacao, data_realizacao, data_resultado, observacoes, paciente_id, medico_id, pacientes(nome), medicos(nome)',
    dateField: 'data_solicitacao',
    statusField: 'status',
    statusOptions: ['solicitado', 'agendado', 'coletado', 'em_analise', 'laudo_disponivel', 'cancelado'],
    medicoField: 'medico_id',
    textSearchFields: ['tipo_exame', 'observacoes'],
    columns: [
      { key: 'data_solicitacao', label: 'Solicitação', format: 'date' },
      { key: 'data_realizacao', label: 'Realização', format: 'date' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'medicos.nome', label: 'Médico' },
      { key: 'tipo_exame', label: 'Exame' },
      { key: 'status', label: 'Status' },
      { key: 'observacoes', label: 'Observações' },
    ],
    groupByOptions: [
      { key: 'tipo_exame', label: 'Tipo de exame' },
      { key: 'status', label: 'Status' },
      { key: 'medicos.nome', label: 'Médico' },
    ],
  },
  prescricoes: {
    label: 'Prescrições',
    table: 'prescricoes',
    select: 'id, data_emissao, medicamento, dosagem, posologia, tipo, paciente_id, medico_id, pacientes(nome), medicos(nome)',
    dateField: 'data_emissao',
    medicoField: 'medico_id',
    textSearchFields: ['medicamento', 'posologia'],
    columns: [
      { key: 'data_emissao', label: 'Data', format: 'date' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'medicos.nome', label: 'Médico' },
      { key: 'medicamento', label: 'Medicamento' },
      { key: 'dosagem', label: 'Dosagem' },
      { key: 'posologia', label: 'Posologia' },
      { key: 'tipo', label: 'Tipo' },
    ],
    groupByOptions: [
      { key: 'medicamento', label: 'Medicamento' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'medicos.nome', label: 'Médico' },
    ],
  },
  atestados: {
    label: 'Atestados',
    table: 'atestados',
    select: 'id, data_emissao, tipo, dias, motivo, paciente_id, medico_id, pacientes(nome), medicos(nome)',
    dateField: 'data_emissao',
    medicoField: 'medico_id',
    textSearchFields: ['motivo', 'tipo'],
    columns: [
      { key: 'data_emissao', label: 'Emissão', format: 'date' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'medicos.nome', label: 'Médico' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'dias', label: 'Dias' },
      { key: 'motivo', label: 'Motivo' },
    ],
    groupByOptions: [
      { key: 'tipo', label: 'Tipo' },
      { key: 'medicos.nome', label: 'Médico' },
    ],
  },
  prontuarios: {
    label: 'Prontuários',
    table: 'prontuarios',
    select: 'id, data, queixa_principal, hipotese_diagnostica, conduta, paciente_id, medico_id, pacientes(nome), medicos(nome)',
    dateField: 'data',
    medicoField: 'medico_id',
    textSearchFields: ['queixa_principal', 'hipotese_diagnostica', 'conduta'],
    columns: [
      { key: 'data', label: 'Data', format: 'datetime' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'medicos.nome', label: 'Médico' },
      { key: 'queixa_principal', label: 'Queixa' },
      { key: 'hipotese_diagnostica', label: 'Hipótese' },
      { key: 'conduta', label: 'Conduta' },
    ],
    groupByOptions: [
      { key: 'medicos.nome', label: 'Médico' },
    ],
  },
  encaminhamentos: {
    label: 'Encaminhamentos',
    table: 'encaminhamentos',
    select: 'id, data_encaminhamento, especialidade_destino, motivo, status, paciente_id, medico_id, pacientes(nome), medicos(nome)',
    dateField: 'data_encaminhamento',
    statusField: 'status',
    statusOptions: ['pendente', 'realizado', 'cancelado'],
    medicoField: 'medico_id',
    textSearchFields: ['motivo', 'especialidade_destino'],
    columns: [
      { key: 'data_encaminhamento', label: 'Data', format: 'date' },
      { key: 'pacientes.nome', label: 'Paciente' },
      { key: 'medicos.nome', label: 'Médico' },
      { key: 'especialidade_destino', label: 'Especialidade' },
      { key: 'motivo', label: 'Motivo' },
      { key: 'status', label: 'Status' },
    ],
    groupByOptions: [
      { key: 'especialidade_destino', label: 'Especialidade' },
      { key: 'status', label: 'Status' },
      { key: 'medicos.nome', label: 'Médico' },
    ],
  },
  estoque: {
    label: 'Estoque',
    table: 'estoque',
    select: 'id, nome, categoria, quantidade, quantidade_minima, unidade, localizacao, validade, preco_unitario, ativo, created_at',
    dateField: 'created_at',
    statusField: 'ativo',
    statusOptions: ['true', 'false'],
    textSearchFields: ['nome', 'categoria', 'localizacao'],
    columns: [
      { key: 'nome', label: 'Item' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'quantidade', label: 'Qtd' },
      { key: 'quantidade_minima', label: 'Mínimo' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'localizacao', label: 'Local' },
      { key: 'validade', label: 'Validade', format: 'date' },
      { key: 'preco_unitario', label: 'Preço', format: 'currency' },
      { key: 'ativo', label: 'Ativo', format: 'boolean' },
    ],
    groupByOptions: [
      { key: 'categoria', label: 'Categoria' },
      { key: 'localizacao', label: 'Local' },
    ],
  },
};

function getValue(row: any, key: string): any {
  return key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), row);
}

function formatCell(val: any, fmt?: ColumnDef['format']): string {
  if (val === null || val === undefined || val === '') return '-';
  switch (fmt) {
    case 'date':
      try { return format(new Date(val), 'dd/MM/yyyy'); } catch { return String(val); }
    case 'datetime':
      try { return format(new Date(val), 'dd/MM/yyyy HH:mm'); } catch { return String(val); }
    case 'currency':
      return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    case 'boolean':
      return val === true || val === 'true' ? 'Sim' : 'Não';
    default:
      return String(val);
  }
}

export default function RelatorioCustomizado() {
  const [dataset, setDataset] = useState<DatasetKey>('lancamentos');
  const cfg = DATASETS[dataset];

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dataInicio, setDataInicio] = useState(format(firstOfMonth, 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(today, 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [medicoFilter, setMedicoFilter] = useState<string>('todos');
  const [convenioFilter, setConvenioFilter] = useState<string>('todos');
  const [textoBusca, setTextoBusca] = useState('');
  const [limite, setLimite] = useState<string>('500');
  const [valorMin, setValorMin] = useState<string>('');
  const [valorMax, setValorMax] = useState<string>('');
  const [tipoLancamento, setTipoLancamento] = useState<string>('todos');
  const [groupBy, setGroupBy] = useState<string>('nenhum');
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(cfg.columns.map(c => c.key)));

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({
    nome: '',
    descricao: '',
    frequencia: 'nenhuma',
    dia_semana: '1',
    dia_mes: '1',
    hora: '08:00',
    destinatarios: '',
    formato: 'pdf',
  });
  const [saving, setSaving] = useState(false);

  const { data: medicos = [] } = useMedicos();
  const { data: convenios = [] } = useConvenios();

  useEffect(() => {
    setVisibleCols(new Set(cfg.columns.map(c => c.key)));
    setStatusFilter('todos');
    setMedicoFilter('todos');
    setConvenioFilter('todos');
    setTipoLancamento('todos');
    setGroupBy('nenhum');
    setRows([]);
  }, [dataset]);

  const runQuery = async () => {
    setLoading(true);
    try {
      let q: any = (supabase as any).from(cfg.table).select(cfg.select);

      if (dataInicio) q = q.gte(cfg.dateField, dataInicio);
      if (dataFim) q = q.lte(cfg.dateField, dataFim + 'T23:59:59');
      if (cfg.statusField && statusFilter !== 'todos') {
        const v = statusFilter === 'true' ? true : statusFilter === 'false' ? false : statusFilter;
        q = q.eq(cfg.statusField, v);
      }
      if (cfg.medicoField && medicoFilter !== 'todos') q = q.eq(cfg.medicoField, medicoFilter);
      if (cfg.convenioField && convenioFilter !== 'todos') q = q.eq(cfg.convenioField, convenioFilter);
      if (dataset === 'lancamentos' && tipoLancamento !== 'todos') q = q.eq('tipo', tipoLancamento);
      if (dataset === 'lancamentos' && valorMin) q = q.gte('valor', Number(valorMin));
      if (dataset === 'lancamentos' && valorMax) q = q.lte('valor', Number(valorMax));
      if (textoBusca && cfg.textSearchFields?.length) {
        const or = cfg.textSearchFields.map(f => `${f}.ilike.%${textoBusca}%`).join(',');
        q = q.or(or);
      }
      q = q.order(cfg.dateField, { ascending: false }).limit(Number(limite));

      const { data, error } = await q;
      if (error) throw error;
      setRows(data || []);
      toast.success(`${data?.length || 0} registros encontrados`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const visibleColumns = useMemo(
    () => cfg.columns.filter(c => visibleCols.has(c.key)),
    [cfg, visibleCols]
  );

  const exportExcel = () => {
    if (!rows.length) { toast.error('Gere o relatório primeiro'); return; }
    const flat = rows.map(r => {
      const o: Record<string, any> = {};
      visibleColumns.forEach(c => { o[c.label] = formatCell(getValue(r, c.key), c.format); });
      return o;
    });
    exportToExcel(flat, `relatorio-${dataset}`, cfg.label);
  };

  const exportCSV = () => {
    if (!rows.length) { toast.error('Gere o relatório primeiro'); return; }
    const head = visibleColumns.map(c => `"${c.label}"`).join(';');
    const lines = rows.map(r =>
      visibleColumns.map(c => `"${String(formatCell(getValue(r, c.key), c.format)).replace(/"/g, '""')}"`).join(';')
    );
    const csv = '\uFEFF' + [head, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${dataset}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const printReport = () => {
    if (!rows.length) { toast.error('Gere o relatório primeiro'); return; }
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>${cfg.label}</title>
      <style>
        body{font-family:Arial;padding:20px;color:#000}
        h1{font-size:18px;margin:0 0 4px}
        .meta{color:#555;font-size:12px;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:6px;text-align:left}
        th{background:#f3f4f6}
      </style></head><body>
        <h1>Relatório - ${cfg.label}</h1>
        <div class="meta">Período: ${dataInicio} a ${dataFim} • ${rows.length} registros • Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
        <table>
          <thead><tr>${visibleColumns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${visibleColumns.map(c => `<td>${formatCell(getValue(r, c.key), c.format)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const totalValor = useMemo(() => {
    if (dataset !== 'lancamentos') return null;
    const r = rows.filter(x => x.tipo === 'receita').reduce((a, x) => a + Number(x.valor || 0), 0);
    const d = rows.filter(x => x.tipo === 'despesa').reduce((a, x) => a + Number(x.valor || 0), 0);
    return { receitas: r, despesas: d, saldo: r - d };
  }, [rows, dataset]);

  const grouped = useMemo(() => {
    if (groupBy === 'nenhum' || !rows.length) return null;
    const map = new Map<string, { label: string; count: number; sum: number }>();
    rows.forEach(r => {
      const raw = getValue(r, groupBy);
      const key = raw == null || raw === '' ? '(Sem valor)' : String(raw);
      const cur = map.get(key) || { label: key, count: 0, sum: 0 };
      cur.count++;
      cur.sum += Number(r.valor || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rows, groupBy]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Relatório Customizado
          </CardTitle>
          <CardDescription>
            Escolha a fonte de dados, aplique filtros e exporte exatamente o que você precisa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Fonte de dados</Label>
              <Select value={dataset} onValueChange={(v) => setDataset(v as DatasetKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATASETS) as DatasetKey[]).map(k => (
                    <SelectItem key={k} value={k}>{DATASETS[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data início</Label>
              <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data fim</Label>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Limite de registros</Label>
              <Select value={limite} onValueChange={setLimite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1.000</SelectItem>
                  <SelectItem value="5000">5.000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cfg.statusField && (
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {cfg.statusOptions?.map(s => (
                      <SelectItem key={s} value={s}>
                        {s === 'true' ? 'Ativo' : s === 'false' ? 'Inativo' : s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cfg.medicoField && (
              <div>
                <Label className="text-xs">Médico</Label>
                <Select value={medicoFilter} onValueChange={setMedicoFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {medicos.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {cfg.convenioField && (
              <div>
                <Label className="text-xs">Convênio</Label>
                <Select value={convenioFilter} onValueChange={setConvenioFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {convenios.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dataset === 'lancamentos' && (
              <>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={tipoLancamento} onValueChange={setTipoLancamento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Valor mín. (R$)</Label>
                  <Input type="number" value={valorMin} onChange={e => setValorMin(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Valor máx. (R$)</Label>
                  <Input type="number" value={valorMax} onChange={e => setValorMax(e.target.value)} />
                </div>
              </>
            )}

            {cfg.textSearchFields?.length ? (
              <div className="md:col-span-2">
                <Label className="text-xs">
                  Busca livre ({cfg.textSearchFields.join(', ')})
                </Label>
                <Input
                  placeholder="Digite para filtrar..."
                  value={textoBusca}
                  onChange={e => setTextoBusca(e.target.value)}
                />
              </div>
            ) : null}

            {cfg.groupByOptions?.length ? (
              <div>
                <Label className="text-xs">Agrupar por (contagem)</Label>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem agrupamento</SelectItem>
                    {cfg.groupByOptions.map(g => (
                      <SelectItem key={g.key} value={g.key}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {/* Column picker */}
          <div>
            <Label className="text-xs">Colunas exibidas</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {cfg.columns.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1 cursor-pointer hover:bg-muted">
                  <Checkbox
                    checked={visibleCols.has(c.key)}
                    onCheckedChange={(v) => {
                      const next = new Set(visibleCols);
                      if (v) next.add(c.key); else next.delete(c.key);
                      setVisibleCols(next);
                    }}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runQuery} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Gerar relatório
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!rows.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" onClick={exportCSV} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" onClick={printReport} disabled={!rows.length}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir / PDF
            </Button>
            <Button variant="outline" onClick={() => setSaveOpen(true)}>
              <Star className="h-4 w-4 mr-2" /> Salvar / Agendar
            </Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Resultados
              <Badge variant="secondary">{rows.length} registros</Badge>
              {totalValor && (
                <>
                  <Badge className="bg-emerald-100 text-emerald-800">
                    Receitas: {totalValor.receitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Badge>
                  <Badge className="bg-rose-100 text-rose-800">
                    Despesas: {totalValor.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Badge>
                  <Badge className={totalValor.saldo >= 0 ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                    Saldo: {totalValor.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Badge>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {grouped && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2">
                  Resumo por {cfg.groupByOptions?.find(g => g.key === groupBy)?.label}
                </h3>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grupo</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                        {dataset === 'lancamentos' && <TableHead className="text-right">Soma (R$)</TableHead>}
                        <TableHead className="text-right">% do total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grouped.map(g => (
                        <TableRow key={g.label}>
                          <TableCell className="font-medium">{g.label}</TableCell>
                          <TableCell className="text-right font-semibold">{g.count}</TableCell>
                          {dataset === 'lancamentos' && (
                            <TableCell className="text-right">
                              {g.sum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </TableCell>
                          )}
                          <TableCell className="text-right text-muted-foreground">
                            {((g.count / rows.length) * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <ScrollArea className="h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map(c => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id || i}>
                      {visibleColumns.map(c => (
                        <TableCell key={c.key} className="text-xs">
                          {formatCell(getValue(r, c.key), c.format)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Salvar relatório como favorito
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome*</Label>
              <Input value={saveForm.nome} onChange={e => setSaveForm({ ...saveForm, nome: e.target.value })} placeholder="Ex: Receita mensal" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={2} value={saveForm.descricao} onChange={e => setSaveForm({ ...saveForm, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Frequência de envio</Label>
                <Select value={saveForm.frequencia} onValueChange={v => setSaveForm({ ...saveForm, frequencia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Apenas favoritar (sem envio)</SelectItem>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Horário de envio</Label>
                <Input type="time" value={saveForm.hora} onChange={e => setSaveForm({ ...saveForm, hora: e.target.value })} />
              </div>
              {saveForm.frequencia === 'semanal' && (
                <div>
                  <Label className="text-xs">Dia da semana</Label>
                  <Select value={saveForm.dia_semana} onValueChange={v => setSaveForm({ ...saveForm, dia_semana: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((d, i) => (
                        <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {saveForm.frequencia === 'mensal' && (
                <div>
                  <Label className="text-xs">Dia do mês</Label>
                  <Input type="number" min={1} max={28} value={saveForm.dia_mes} onChange={e => setSaveForm({ ...saveForm, dia_mes: e.target.value })} />
                </div>
              )}
              <div>
                <Label className="text-xs">Formato</Label>
                <Select value={saveForm.formato} onValueChange={v => setSaveForm({ ...saveForm, formato: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {saveForm.frequencia !== 'nenhuma' && (
              <div>
                <Label className="text-xs">Destinatários (e-mails separados por vírgula)</Label>
                <Textarea rows={2} value={saveForm.destinatarios} onChange={e => setSaveForm({ ...saveForm, destinatarios: e.target.value })} placeholder="gestor@clinica.com, financeiro@clinica.com" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Os filtros e colunas atuais serão salvos. Use a página <b>Relatórios → Salvos</b> para gerenciar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button
              disabled={saving || !saveForm.nome}
              onClick={async () => {
                setSaving(true);
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) throw new Error('Sem sessão');
                  const { data: prof } = await supabase.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle();
                  const config = {
                    dataInicio, dataFim, statusFilter, medicoFilter, convenioFilter,
                    textoBusca, limite: Number(limite), valorMin, valorMax,
                    tipoLancamento, groupBy, colunas: Array.from(visibleCols),
                  };
                  const dests = saveForm.destinatarios.split(',').map(s => s.trim()).filter(Boolean);
                  const payload: any = {
                    user_id: user.id,
                    clinica_id: prof?.clinica_id,
                    nome: saveForm.nome,
                    descricao: saveForm.descricao || null,
                    dataset,
                    config,
                    formato: saveForm.formato,
                    destinatarios: dests,
                    ativo: true,
                  };
                  if (saveForm.frequencia !== 'nenhuma') {
                    payload.frequencia = saveForm.frequencia;
                    payload.hora = saveForm.hora + ':00';
                    if (saveForm.frequencia === 'semanal') payload.dia_semana = Number(saveForm.dia_semana);
                    if (saveForm.frequencia === 'mensal') payload.dia_mes = Number(saveForm.dia_mes);
                    // Calcular próxima execução simples (hoje + horário)
                    const [h, m] = saveForm.hora.split(':').map(Number);
                    const d = new Date(); d.setHours(h, m, 0, 0);
                    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
                    payload.proxima_execucao = d.toISOString();
                  }
                  const { error } = await (supabase as any).from('relatorios_salvos').insert(payload);
                  if (error) throw error;
                  toast.success('Relatório salvo com sucesso');
                  setSaveOpen(false);
                  setSaveForm({ nome: '', descricao: '', frequencia: 'nenhuma', dia_semana: '1', dia_mes: '1', hora: '08:00', destinatarios: '', formato: 'pdf' });
                } catch (e: any) {
                  toast.error(e.message || 'Erro ao salvar');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Star className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}