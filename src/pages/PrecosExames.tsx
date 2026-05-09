import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { DollarSign, Plus, Search, Edit, Trash2, Building2, Stethoscope, Loader2 } from 'lucide-react';

const CATALOGO_EXAMES: { nome: string; tuss: string }[] = [
  { nome: 'Hemograma Completo', tuss: '40304361' },
  { nome: 'Coagulograma', tuss: '40304540' },
  { nome: 'Tempo de Protrombina (TP)', tuss: '40304590' },
  { nome: 'TTPA', tuss: '40304604' },
  { nome: 'VHS', tuss: '40304680' },
  { nome: 'Reticulócitos', tuss: '40304507' },
  { nome: 'Plaquetas', tuss: '40304470' },
  { nome: 'Grupo Sanguíneo (ABO/Rh)', tuss: '40304213' },
  { nome: 'Coombs Direto', tuss: '40304167' },
  { nome: 'Coombs Indireto', tuss: '40304175' },
  { nome: 'Eletroforese de Hemoglobina', tuss: '40304256' },
  { nome: 'Ferro Sérico', tuss: '40301630' },
  { nome: 'Ferritina', tuss: '40316360' },
  { nome: 'Transferrina', tuss: '40316700' },
  { nome: 'TIBC', tuss: '40301648' },
  { nome: 'Glicose em Jejum', tuss: '40302040' },
  { nome: 'Hemoglobina Glicada (HbA1c)', tuss: '40302059' },
  { nome: 'Curva Glicêmica (TOTG)', tuss: '40302024' },
  { nome: 'Insulina Basal', tuss: '40316459' },
  { nome: 'Peptídeo C', tuss: '40316580' },
  { nome: 'Colesterol Total', tuss: '40301508' },
  { nome: 'HDL Colesterol', tuss: '40301516' },
  { nome: 'LDL Colesterol', tuss: '40301524' },
  { nome: 'VLDL Colesterol', tuss: '40301532' },
  { nome: 'Triglicerídeos', tuss: '40301869' },
  { nome: 'Perfil Lipídico Completo', tuss: '40301508' },
  { nome: 'Ureia', tuss: '40301885' },
  { nome: 'Creatinina', tuss: '40301575' },
  { nome: 'Ácido Úrico', tuss: '40301397' },
  { nome: 'TGO (AST)', tuss: '40301851' },
  { nome: 'TGP (ALT)', tuss: '40301842' },
  { nome: 'Gama GT', tuss: '40302016' },
  { nome: 'Fosfatase Alcalina', tuss: '40301940' },
  { nome: 'Bilirrubinas Total e Frações', tuss: '40301443' },
  { nome: 'Proteínas Totais e Frações', tuss: '40301796' },
  { nome: 'Albumina', tuss: '40301401' },
  { nome: 'Amilase', tuss: '40301419' },
  { nome: 'Lipase', tuss: '40301672' },
  { nome: 'DHL', tuss: '40301591' },
  { nome: 'CPK', tuss: '40301559' },
  { nome: 'CPK-MB', tuss: '40301567' },
  { nome: 'Troponina I', tuss: '40301877' },
  { nome: 'BNP', tuss: '40316297' },
  { nome: 'PCR (Proteína C-Reativa)', tuss: '40308014' },
  { nome: 'PCR Ultrassensível', tuss: '40308022' },
  { nome: 'Homocisteína', tuss: '40316424' },
  { nome: 'Sódio', tuss: '40301834' },
  { nome: 'Potássio', tuss: '40301770' },
  { nome: 'Cálcio Total', tuss: '40301460' },
  { nome: 'Cálcio Iônico', tuss: '40301478' },
  { nome: 'Magnésio', tuss: '40301680' },
  { nome: 'Fósforo', tuss: '40301958' },
  { nome: 'Cloro', tuss: '40301494' },
  { nome: 'Zinco', tuss: '40301893' },
  { nome: 'TSH', tuss: '40316912' },
  { nome: 'T3 Livre', tuss: '40316882' },
  { nome: 'T4 Livre', tuss: '40316890' },
  { nome: 'T3 Total', tuss: '40316874' },
  { nome: 'T4 Total', tuss: '40316904' },
  { nome: 'Anti-TPO', tuss: '40308146' },
  { nome: 'Anti-Tireoglobulina', tuss: '40308138' },
  { nome: 'Tireoglobulina', tuss: '40316858' },
  { nome: 'Cortisol Basal', tuss: '40316327' },
  { nome: 'ACTH', tuss: '40316270' },
  { nome: 'Prolactina', tuss: '40316610' },
  { nome: 'GH', tuss: '40316394' },
  { nome: 'IGF-1', tuss: '40316440' },
  { nome: 'LH', tuss: '40316483' },
  { nome: 'FSH', tuss: '40316378' },
  { nome: 'Estradiol', tuss: '40316351' },
  { nome: 'Progesterona', tuss: '40316602' },
  { nome: 'Testosterona Total', tuss: '40316840' },
  { nome: 'Testosterona Livre', tuss: '40316831' },
  { nome: 'DHEA-S', tuss: '40316335' },
  { nome: 'Androstenediona', tuss: '40316289' },
  { nome: '17-OH Progesterona', tuss: '40316262' },
  { nome: 'SHBG', tuss: '40316777' },
  { nome: 'Beta-HCG Quantitativo', tuss: '40316050' },
  { nome: 'PTH (Paratormônio)', tuss: '40316629' },
  { nome: 'Calcitonina', tuss: '40316300' },
  { nome: 'Aldosterona', tuss: '40316270' },
  { nome: 'Renina', tuss: '40316653' },
  { nome: 'PSA Total', tuss: '40316637' },
  { nome: 'PSA Livre', tuss: '40316645' },
  { nome: 'CEA', tuss: '40316319' },
  { nome: 'CA 125', tuss: '40316068' },
  { nome: 'CA 19-9', tuss: '40316076' },
  { nome: 'CA 15-3', tuss: '40316084' },
  { nome: 'AFP', tuss: '40316050' },
  { nome: 'CA 72-4', tuss: '40316092' },
  { nome: 'Urina Tipo I (EAS)', tuss: '40311066' },
  { nome: 'Urocultura', tuss: '40310213' },
  { nome: 'Creatinina Urinária 24h', tuss: '40301575' },
  { nome: 'Microalbuminúria', tuss: '40311023' },
  { nome: 'Clearance de Creatinina', tuss: '40301583' },
  { nome: 'Parasitológico de Fezes (EPF)', tuss: '40311082' },
  { nome: 'Coprocultura', tuss: '40310116' },
  { nome: 'Sangue Oculto nas Fezes', tuss: '40311074' },
  { nome: 'Anti-HIV 1 e 2', tuss: '40307166' },
  { nome: 'VDRL', tuss: '40308308' },
  { nome: 'FTA-ABS IgG/IgM', tuss: '40308251' },
  { nome: 'Hepatite A (Anti-HAV IgM)', tuss: '40307310' },
  { nome: 'Hepatite B (HBsAg)', tuss: '40307336' },
  { nome: 'Hepatite B (Anti-HBs)', tuss: '40307344' },
  { nome: 'Hepatite B (Anti-HBc Total)', tuss: '40307352' },
  { nome: 'Hepatite C (Anti-HCV)', tuss: '40307387' },
  { nome: 'Toxoplasmose IgG', tuss: '40308286' },
  { nome: 'Toxoplasmose IgM', tuss: '40308294' },
  { nome: 'Rubéola IgG', tuss: '40307689' },
  { nome: 'Rubéola IgM', tuss: '40307697' },
  { nome: 'Citomegalovírus IgG', tuss: '40307220' },
  { nome: 'Citomegalovírus IgM', tuss: '40307239' },
  { nome: 'Dengue IgG/IgM', tuss: '40307247' },
  { nome: 'COVID-19 IgG/IgM', tuss: '40314618' },
  { nome: 'FAN', tuss: '40308065' },
  { nome: 'Fator Reumatoide', tuss: '40308073' },
  { nome: 'Anti-CCP', tuss: '40308103' },
  { nome: 'IgE Total', tuss: '40308189' },
  { nome: 'ASLO', tuss: '40308057' },
  { nome: 'Vitamina D (25-OH)', tuss: '40316920' },
  { nome: 'Vitamina B12', tuss: '40316769' },
  { nome: 'Ácido Fólico', tuss: '40316750' },
  { nome: 'Radiografia de Tórax PA/Perfil', tuss: '40801020' },
  { nome: 'Radiografia de Coluna Cervical', tuss: '40801039' },
  { nome: 'Radiografia de Coluna Lombar', tuss: '40801047' },
  { nome: 'Radiografia de Mão e Punho', tuss: '40801055' },
  { nome: 'Radiografia de Joelho', tuss: '40801063' },
  { nome: 'Radiografia de Seios da Face', tuss: '40801080' },
  { nome: 'Ultrassom de Abdome Total', tuss: '40901017' },
  { nome: 'Ultrassom de Abdome Superior', tuss: '40901025' },
  { nome: 'Ultrassom Pélvico', tuss: '40901033' },
  { nome: 'Ultrassom Transvaginal', tuss: '40901041' },
  { nome: 'Ultrassom Obstétrico', tuss: '40901050' },
  { nome: 'Ultrassom Morfológico', tuss: '40901068' },
  { nome: 'Ultrassom de Tireoide', tuss: '40901076' },
  { nome: 'Ultrassom de Mama Bilateral', tuss: '40901084' },
  { nome: 'Ultrassom de Próstata', tuss: '40901092' },
  { nome: 'Ultrassom Renal', tuss: '40901106' },
  { nome: 'Ultrassom Doppler Carótidas', tuss: '40901122' },
  { nome: 'Ultrassom Doppler Venoso MMII', tuss: '40901131' },
  { nome: 'Ultrassom Doppler Arterial MMII', tuss: '40901149' },
  { nome: 'Ultrassom de Partes Moles', tuss: '40901157' },
  { nome: 'TC de Crânio', tuss: '41001028' },
  { nome: 'TC de Tórax', tuss: '41001036' },
  { nome: 'TC de Abdome Total', tuss: '41001044' },
  { nome: 'TC de Coluna Lombar', tuss: '41001052' },
  { nome: 'TC de Seios da Face', tuss: '41001079' },
  { nome: 'Angiotomografia Coronariana', tuss: '41001087' },
  { nome: 'RM de Crânio', tuss: '41101014' },
  { nome: 'RM de Coluna Cervical', tuss: '41101022' },
  { nome: 'RM de Coluna Lombar', tuss: '41101030' },
  { nome: 'RM de Joelho', tuss: '41101049' },
  { nome: 'RM de Ombro', tuss: '41101057' },
  { nome: 'RM de Abdome', tuss: '41101065' },
  { nome: 'RM de Pelve', tuss: '41101073' },
  { nome: 'RM Cardíaca', tuss: '41101081' },
  { nome: 'Mamografia Bilateral', tuss: '40901211' },
  { nome: 'Densitometria Óssea', tuss: '40801098' },
  { nome: 'Eletrocardiograma (ECG)', tuss: '40101010' },
  { nome: 'Ecocardiograma Transtorácico', tuss: '40101029' },
  { nome: 'Ecocardiograma com Doppler', tuss: '40101037' },
  { nome: 'Teste Ergométrico', tuss: '40101045' },
  { nome: 'Holter 24h', tuss: '40101053' },
  { nome: 'MAPA 24h', tuss: '40101061' },
  { nome: 'Eletroencefalograma (EEG)', tuss: '40201015' },
  { nome: 'Eletroneuromiografia (ENMG)', tuss: '40201023' },
  { nome: 'Espirometria', tuss: '40301010' },
  { nome: 'Polissonografia', tuss: '40301036' },
  { nome: 'Tonometria', tuss: '40501012' },
  { nome: 'Campimetria Visual', tuss: '40501020' },
  { nome: 'Retinografia', tuss: '40501039' },
  { nome: 'OCT', tuss: '40501047' },
  { nome: 'Mapeamento de Retina', tuss: '40501055' },
  { nome: 'Audiometria Tonal e Vocal', tuss: '40601013' },
  { nome: 'Impedanciometria', tuss: '40601021' },
  { nome: 'Videolaringoscopia', tuss: '40601030' },
  { nome: 'Papanicolaou', tuss: '40601056' },
  { nome: 'Colposcopia', tuss: '40601064' },
  { nome: 'Endoscopia Digestiva Alta', tuss: '40201040' },
  { nome: 'Colonoscopia', tuss: '40201058' },
  { nome: 'Biópsia de Pele', tuss: '40401014' },
  { nome: 'Anatomopatológico', tuss: '40401022' },
  { nome: 'Gasometria Arterial', tuss: '40302075' },
  { nome: 'Hemoculturas', tuss: '40310167' },
  { nome: 'Antibiograma', tuss: '40310191' },
  { nome: 'D-Dímero', tuss: '40304183' },
  { nome: 'Fibrinogênio', tuss: '40304281' },
  { nome: 'Procalcitonina', tuss: '40316815' },
  { nome: 'Cariótipo', tuss: '40314014' },
];

function ExameCombobox({ value, onChange }: { value: string; onChange: (nome: string, tuss: string) => void }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm) return CATALOGO_EXAMES;
    const q = searchTerm.toLowerCase();
    return CATALOGO_EXAMES.filter(e => e.nome.toLowerCase().includes(q) || e.tuss.includes(q));
  }, [searchTerm]);

  const isCustomName = searchTerm.trim() && !filtered.some(e => e.nome.toLowerCase() === searchTerm.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className={cn("w-full justify-between h-11 font-normal text-left", !value && "text-muted-foreground")}>
          <span className="truncate">{value || 'Selecione ou digite um nome de exame...'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar ou digitar nome do exame..." value={searchTerm} onValueChange={setSearchTerm} />
          <CommandList className="max-h-[280px]">
            {isCustomName && (
              <CommandGroup heading="Criar novo">
                <CommandItem
                  value={`__custom__${searchTerm}`}
                  onSelect={() => { onChange(searchTerm.trim(), ''); setOpen(false); setSearchTerm(''); }}
                  className="text-primary font-medium"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar "{searchTerm.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
            {filtered.length === 0 && !isCustomName ? (
              <CommandEmpty>Nenhum exame encontrado.</CommandEmpty>
            ) : filtered.length > 0 ? (
              <CommandGroup heading="Catálogo TUSS">
                {filtered.map((e) => (
                  <CommandItem key={e.tuss + e.nome} value={e.nome}
                    onSelect={() => { onChange(e.nome, e.tuss); setOpen(false); setSearchTerm(''); }}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === e.nome ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 text-sm">{e.nome}</span>
                    <span className="text-xs text-muted-foreground font-mono ml-2">{e.tuss}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// ─── Internal/Particular Prices Tab ───
function PrecosInternos() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: '', codigo_tuss: '', descricao: '', valor: '', custo: '' });

  const { data: precos = [], isLoading } = useQuery({
    queryKey: ['precos-exames-internos', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from('configuracoes_clinica')
        .select('valor')
        .eq('chave', 'precos_exames_internos')
        .eq('user_id', user.id)
        .maybeSingle();
      return (data?.valor as any[]) || [];
    },
    enabled: !!user?.id,
  });

  const saveAll = async (list: any[]) => {
    if (!user?.id) throw new Error('Usuário não identificado');
    const { error } = await supabase.from('configuracoes_clinica').upsert({
      chave: 'precos_exames_internos',
      user_id: user.id,
      valor: list as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,chave' });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['precos-exames-internos'] });
  };

  const handleSave = async () => {
    if (!form.nome || !form.valor) { toast.error('Preencha nome e valor'); return; }
    const entry = { nome: form.nome, codigo_tuss: form.codigo_tuss, descricao: form.descricao, valor: +form.valor, custo: form.custo ? +form.custo : 0 };
    const list = [...precos];
    if (editIdx !== null) list[editIdx] = entry;
    else list.push(entry);
    try {
      await saveAll(list);
      toast.success(editIdx !== null ? 'Atualizado!' : 'Cadastrado!');
      setShowForm(false);
      setEditIdx(null);
      setForm({ nome: '', codigo_tuss: '', descricao: '', valor: '', custo: '' });
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar exame');
    }
  };

  const handleDelete = async (idx: number) => {
    const list = precos.filter((_: any, i: number) => i !== idx);
    try {
      await saveAll(list);
      toast.success('Removido!');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao remover exame');
    }
  };

  const openEdit = (idx: number) => {
    const p = precos[idx];
    setEditIdx(idx);
    setForm({ nome: p.nome, codigo_tuss: p.codigo_tuss || '', descricao: p.descricao || '', valor: String(p.valor), custo: String(p.custo || '') });
    setShowForm(true);
  };

  const filtered = useMemo(() => {
    if (!search) return precos;
    const q = search.toLowerCase();
    return precos.filter((p: any) => p.nome?.toLowerCase().includes(q) || p.codigo_tuss?.toLowerCase().includes(q));
  }, [precos, search]);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar exame..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button onClick={() => { setEditIdx(null); setForm({ nome: '', codigo_tuss: '', descricao: '', valor: '', custo: '' }); setShowForm(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo Exame
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exame</TableHead>
                <TableHead>TUSS</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor Particular</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum exame cadastrado. Clique "Novo Exame" para começar.</TableCell></TableRow>
              ) : (
                filtered.map((p: any) => {
                  const originalIdx = precos.indexOf(p);
                  const margem = p.custo > 0 ? ((p.valor - p.custo) / p.valor * 100) : 100;
                  return (
                    <TableRow key={`${p.nome}-${p.codigo_tuss || 'sem-tuss'}-${originalIdx}`}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_tuss || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{p.descricao || '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(p.valor)}</TableCell>
                      <TableCell className="text-right">{p.custo > 0 ? fmt(p.custo) : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={margem >= 50 ? 'default' : margem >= 20 ? 'secondary' : 'destructive'} className="text-xs">
                          {margem.toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(originalIdx)}><Edit className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(originalIdx)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {filtered.length > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{filtered.length} exame(s)</span>
          <span>Média: {fmt(filtered.reduce((s: number, p: any) => s + (p.valor || 0), 0) / filtered.length)}</span>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditIdx(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              {editIdx !== null ? 'Editar Exame' : 'Novo Exame Particular'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome do Exame *</Label>
              <ExameCombobox value={form.nome} onChange={(nome, tuss) => setForm(p => ({ ...p, nome, codigo_tuss: tuss || p.codigo_tuss }))} />
            </div>
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Código TUSS</Label>
                <div className="flex gap-1.5">
                  <Input value={form.codigo_tuss} onChange={(e) => setForm(p => ({ ...p, codigo_tuss: e.target.value }))}
                    placeholder="Ex: 40301630 ou livre" className="font-mono flex-1" />
                  <Button type="button" variant="outline" size="sm" className="h-9 px-2 text-xs whitespace-nowrap"
                    onClick={() => {
                      const auto = 'INT' + Date.now().toString().slice(-7);
                      setForm(p => ({ ...p, codigo_tuss: auto }));
                    }}
                    title="Gerar código interno automático"
                  >
                    Auto
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Descrição</Label>
                <Input value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Breve descrição" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Valor Particular (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                  <Input type="number" step="0.01" min="0" value={form.valor}
                    onChange={(e) => setForm(p => ({ ...p, valor: e.target.value }))}
                    placeholder="0,00" className="pl-10 h-11 text-lg font-bold tabular-nums" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Custo (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                  <Input type="number" step="0.01" min="0" value={form.custo}
                    onChange={(e) => setForm(p => ({ ...p, custo: e.target.value }))}
                    placeholder="0,00" className="pl-10 h-11 tabular-nums" />
                </div>
              </div>
            </div>
            {form.valor && form.custo && Number(form.custo) > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Margem de lucro</span>
                <Badge variant={((Number(form.valor) - Number(form.custo)) / Number(form.valor) * 100) >= 50 ? 'default' : 'secondary'}>
                  {(((Number(form.valor) - Number(form.custo)) / Number(form.valor)) * 100).toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.nome || !form.valor} className="gap-2">
              {editIdx !== null ? 'Salvar Alterações' : 'Cadastrar Exame'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Convênio Prices Tab ───
function PrecosConvenio() {
  const [search, setSearch] = useState('');
  const [filterConvenio, setFilterConvenio] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: convenios } = useQuery({
    queryKey: ['convenios-precos'],
    queryFn: async () => {
      const { data } = await supabase.from('convenios').select('id, nome, codigo').eq('ativo', true).order('nome');
      return data || [];
    },
  });

  const { data: precos, isLoading } = useQuery({
    queryKey: ['precos-exames'],
    queryFn: async () => {
      const { data } = await supabase
        .from('precos_exames_convenio')
        .select('*, convenios(nome, codigo)')
        .order('tipo_exame');
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (form: any) => {
      if (editing) {
        const { error } = await supabase.from('precos_exames_convenio').update({
          convenio_id: form.convenio_id, tipo_exame: form.tipo_exame, codigo_tuss: form.codigo_tuss || null,
          descricao: form.descricao || null, valor_tabela: +form.valor_tabela, valor_filme: form.valor_filme ? +form.valor_filme : 0,
          valor_custo: form.valor_custo ? +form.valor_custo : 0, valor_repasse: form.valor_repasse ? +form.valor_repasse : 0,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('precos_exames_convenio').insert({
          convenio_id: form.convenio_id, tipo_exame: form.tipo_exame, codigo_tuss: form.codigo_tuss || null,
          descricao: form.descricao || null, valor_tabela: +form.valor_tabela, valor_filme: form.valor_filme ? +form.valor_filme : 0,
          valor_custo: form.valor_custo ? +form.valor_custo : 0, valor_repasse: form.valor_repasse ? +form.valor_repasse : 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precos-exames'] });
      toast.success(editing ? 'Preço atualizado!' : 'Preço cadastrado!');
      setShowNew(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message?.includes('unique') ? 'Já existe preço para este exame neste convênio' : 'Erro ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('precos_exames_convenio').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precos-exames'] });
      toast.success('Removido');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const filtered = precos?.filter((p: any) => {
    const matchSearch = p.tipo_exame.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo_tuss?.toLowerCase().includes(search.toLowerCase());
    const matchConvenio = filterConvenio === 'all' || p.convenio_id === filterConvenio;
    return matchSearch && matchConvenio;
  });

  const [form, setForm] = useState({
    convenio_id: '', tipo_exame: '', codigo_tuss: '', descricao: '', valor_tabela: '', valor_filme: '', valor_custo: '', valor_repasse: '',
  });

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      convenio_id: p.convenio_id, tipo_exame: p.tipo_exame, codigo_tuss: p.codigo_tuss || '',
      descricao: p.descricao || '', valor_tabela: String(p.valor_tabela), valor_filme: String(p.valor_filme || ''),
      valor_custo: String(p.valor_custo || ''), valor_repasse: String(p.valor_repasse || ''),
    });
    setShowNew(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar exame ou TUSS..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterConvenio} onValueChange={setFilterConvenio}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os convênios</SelectItem>
            {convenios?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditing(null); setForm({ convenio_id: '', tipo_exame: '', codigo_tuss: '', descricao: '', valor_tabela: '', valor_filme: '', valor_custo: '', valor_repasse: '' }); setShowNew(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo Preço
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Convênio</TableHead>
                <TableHead>Exame</TableHead>
                <TableHead>TUSS</TableHead>
                <TableHead className="text-right">Tabela</TableHead>
                <TableHead className="text-right">Filme</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum preço cadastrado</TableCell></TableRow>
              ) : (
                filtered?.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell><Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{p.convenios?.nome}</Badge></TableCell>
                    <TableCell className="font-medium">{p.tipo_exame}</TableCell>
                    <TableCell className="font-mono text-xs">{p.codigo_tuss || '—'}</TableCell>
                    <TableCell className="text-right">{fmt(p.valor_tabela)}</TableCell>
                    <TableCell className="text-right">{fmt(p.valor_filme || 0)}</TableCell>
                    <TableCell className="text-right">{fmt(p.valor_custo || 0)}</TableCell>
                    <TableCell className="text-right">{fmt(p.valor_repasse || 0)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(p.valor_total || p.valor_tabela)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showNew} onOpenChange={(v) => { setShowNew(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar Preço' : 'Novo Preço de Exame por Convênio'}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4">
            <div>
              <Label>Convênio *</Label>
              <Select value={form.convenio_id} onValueChange={(v) => setForm(p => ({ ...p, convenio_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{convenios?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tipo de Exame *</Label><Input value={form.tipo_exame} onChange={(e) => setForm(p => ({ ...p, tipo_exame: e.target.value }))} placeholder="Hemograma Completo" /></div>
              <div><Label>Código TUSS</Label><Input value={form.codigo_tuss} onChange={(e) => setForm(p => ({ ...p, codigo_tuss: e.target.value }))} placeholder="40301630" /></div>
            </div>
            <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor Tabela (R$) *</Label><Input type="number" step="0.01" value={form.valor_tabela} onChange={(e) => setForm(p => ({ ...p, valor_tabela: e.target.value }))} /></div>
              <div><Label>Valor Filme (R$)</Label><Input type="number" step="0.01" value={form.valor_filme} onChange={(e) => setForm(p => ({ ...p, valor_filme: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Custo (R$)</Label><Input type="number" step="0.01" value={form.valor_custo} onChange={(e) => setForm(p => ({ ...p, valor_custo: e.target.value }))} /></div>
              <div><Label>Repasse (R$)</Label><Input type="number" step="0.01" value={form.valor_repasse} onChange={(e) => setForm(p => ({ ...p, valor_repasse: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.convenio_id || !form.tipo_exame || !form.valor_tabela || saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editing ? 'Salvar' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───
export default function PrecosExames() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" /> Tabela de Preços de Exames
        </h1>
        <p className="text-muted-foreground text-sm">Gerencie preços de exames internos (particular) e por convênio</p>
      </div>

      <Tabs defaultValue="particular" className="space-y-4">
        <TabsList>
          <TabsTrigger value="particular" className="gap-1.5">
            <Stethoscope className="h-3.5 w-3.5" /> Particular / Interno
          </TabsTrigger>
          <TabsTrigger value="convenio" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Por Convênio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="particular">
          <PrecosInternos />
        </TabsContent>

        <TabsContent value="convenio">
          <PrecosConvenio />
        </TabsContent>
      </Tabs>
    </div>
  );
}
