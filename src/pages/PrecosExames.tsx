import { salvarConfigClinica } from '@/lib/configClinica';
import React, { useState, useMemo } from 'react';
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
import { DeleteConfirmDialog } from '@/components/ConfirmDialog';
import { AlertTriangle, DollarSign, Plus, Search, Edit, Trash2, Building2, Stethoscope, Loader2, ExternalLink } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ErrorState';
import { normalizarTexto } from '@/lib/buscaPaciente';
import { buscarEmBlocos, LIMITE_BUSCA_EM_BLOCOS } from '@/lib/buscarEmBlocos';

const CATALOGO_EXAMES: { nome: string; tuss: string }[] = [
  { nome: 'Hemograma Completo', tuss: '40304361' },
  { nome: 'Coagulograma', tuss: '40304922' },
  { nome: 'Tempo de Protrombina (TP)', tuss: '40304590' },
  { nome: 'TTPA', tuss: '40304639' },
  { nome: 'VHS', tuss: '40304370' },
  { nome: 'Reticulócitos', tuss: '40304558' },
  { nome: 'Plaquetas', tuss: '' },
  { nome: 'Grupo Sanguíneo (ABO/Rh)', tuss: '40403173' },
  { nome: 'Coombs Direto', tuss: '40304108' },
  { nome: 'Coombs Indireto', tuss: '40304884' },
  { nome: 'Eletroforese de Hemoglobina', tuss: '40304353' },
  { nome: 'Ferro Sérico', tuss: '40301842' },
  { nome: 'Ferritina', tuss: '40316270' },
  { nome: 'Transferrina', tuss: '40302520' },
  { nome: 'TIBC', tuss: '' },
  { nome: 'Glicose em Jejum', tuss: '40302040' },
  { nome: 'Hemoglobina Glicada (HbA1c)', tuss: '40302733' },
  { nome: 'Curva Glicêmica (TOTG)', tuss: '40301680' },
  { nome: 'Insulina Basal', tuss: '40316360' },
  { nome: 'Peptídeo C', tuss: '40316394' },
  { nome: 'Colesterol Total', tuss: '40301605' },
  { nome: 'HDL Colesterol', tuss: '40301583' },
  { nome: 'LDL Colesterol', tuss: '40301591' },
  { nome: 'VLDL Colesterol', tuss: '40302695' },
  { nome: 'Triglicerídeos', tuss: '40302547' },
  { nome: 'Perfil Lipídico Completo', tuss: '40302750' },
  { nome: 'Ureia', tuss: '40302580' },
  { nome: 'Creatinina', tuss: '40301630' },
  { nome: 'Ácido Úrico', tuss: '40301150' },
  { nome: 'TGO (AST)', tuss: '40302504' },
  { nome: 'TGP (ALT)', tuss: '40302512' },
  { nome: 'Gama GT', tuss: '40301990' },
  { nome: 'Fosfatase Alcalina', tuss: '40301885' },
  { nome: 'Bilirrubinas Total e Frações', tuss: '40301397' },
  { nome: 'Proteínas Totais e Frações', tuss: '40302385' },
  { nome: 'Albumina', tuss: '40301222' },
  { nome: 'Amilase', tuss: '40301281' },
  { nome: 'Lipase', tuss: '40302199' },
  { nome: 'DHL', tuss: '40301729' },
  { nome: 'CPK', tuss: '40301648' },
  { nome: 'CPK-MB', tuss: '' },
  { nome: 'Troponina I', tuss: '' },
  { nome: 'BNP', tuss: '40302776' },
  { nome: 'PCR (Proteína C-Reativa)', tuss: '40308391' },
  { nome: 'PCR Ultrassensível', tuss: '' },
  { nome: 'Homocisteína', tuss: '40302113' },
  { nome: 'Sódio', tuss: '40302423' },
  { nome: 'Potássio', tuss: '40302318' },
  { nome: 'Cálcio Total', tuss: '40301400' },
  { nome: 'Cálcio Iônico', tuss: '40301419' },
  { nome: 'Magnésio', tuss: '40302237' },
  { nome: 'Fósforo', tuss: '40301931' },
  { nome: 'Cloro', tuss: '40301559' },
  { nome: 'Zinco', tuss: '40313328' },
  { nome: 'TSH', tuss: '40316521' },
  { nome: 'T3 Livre', tuss: '40316467' },
  { nome: 'T4 Livre', tuss: '40316491' },
  { nome: 'T3 Total', tuss: '40316556' },
  { nome: 'T4 Total', tuss: '40316548' },
  { nome: 'Anti-TPO', tuss: '40316157' },
  { nome: 'Anti-Tireoglobulina', tuss: '40316106' },
  { nome: 'Tireoglobulina', tuss: '40316530' },
  { nome: 'Cortisol Basal', tuss: '40316190' },
  { nome: 'ACTH', tuss: '40316041' },
  { nome: 'Prolactina', tuss: '40316416' },
  { nome: 'GH', tuss: '40316203' },
  { nome: 'IGF-1', tuss: '40316440' },
  { nome: 'LH', tuss: '40316335' },
  { nome: 'FSH', tuss: '40316289' },
  { nome: 'Estradiol', tuss: '40316246' },
  { nome: 'Progesterona', tuss: '40316408' },
  { nome: 'Testosterona Total', tuss: '40316513' },
  { nome: 'Testosterona Livre', tuss: '40316505' },
  { nome: 'DHEA-S', tuss: '' },
  { nome: 'Androstenediona', tuss: '40316076' },
  { nome: '17-OH Progesterona', tuss: '' },
  { nome: 'SHBG', tuss: '40316300' },
  { nome: 'Beta-HCG Quantitativo', tuss: '' },
  { nome: 'PTH (Paratormônio)', tuss: '40305465' },
  { nome: 'Calcitonina', tuss: '40316165' },
  { nome: 'Aldosterona', tuss: '40316050' },
  { nome: 'Renina', tuss: '40316432' },
  { nome: 'PSA Total', tuss: '40316149' },
  { nome: 'PSA Livre', tuss: '40316130' },
  { nome: 'CEA', tuss: '40316122' },
  { nome: 'CA 125', tuss: '40316378' },
  { nome: 'CA 19-9', tuss: '40316378' },
  { nome: 'CA 15-3', tuss: '40316378' },
  { nome: 'AFP', tuss: '40316068' },
  { nome: 'CA 72-4', tuss: '' },
  { nome: 'Urina Tipo I (EAS)', tuss: '' },
  { nome: 'Urocultura', tuss: '40310213' },
  { nome: 'Creatinina Urinária 24h', tuss: '' },
  { nome: 'Microalbuminúria', tuss: '' },
  { nome: 'Clearance de Creatinina', tuss: '' },
  { nome: 'Parasitológico de Fezes (EPF)', tuss: '' },
  { nome: 'Coprocultura', tuss: '' },
  { nome: 'Sangue Oculto nas Fezes', tuss: '' },
  { nome: 'Anti-HIV 1 e 2', tuss: '' },
  { nome: 'VDRL', tuss: '' },
  { nome: 'FTA-ABS IgG/IgM', tuss: '' },
  { nome: 'Hepatite A (Anti-HAV IgM)', tuss: '' },
  { nome: 'Hepatite B (HBsAg)', tuss: '' },
  { nome: 'Hepatite B (Anti-HBs)', tuss: '' },
  { nome: 'Hepatite B (Anti-HBc Total)', tuss: '' },
  { nome: 'Hepatite C (Anti-HCV)', tuss: '' },
  { nome: 'Toxoplasmose IgG', tuss: '' },
  { nome: 'Toxoplasmose IgM', tuss: '' },
  { nome: 'Rubéola IgG', tuss: '' },
  { nome: 'Rubéola IgM', tuss: '' },
  { nome: 'Citomegalovírus IgG', tuss: '' },
  { nome: 'Citomegalovírus IgM', tuss: '' },
  { nome: 'Dengue IgG/IgM', tuss: '' },
  { nome: 'COVID-19 IgG/IgM', tuss: '' },
  { nome: 'FAN', tuss: '' },
  { nome: 'Fator Reumatoide', tuss: '' },
  { nome: 'Anti-CCP', tuss: '' },
  { nome: 'IgE Total', tuss: '' },
  { nome: 'ASLO', tuss: '' },
  { nome: 'Vitamina D (25-OH)', tuss: '40302830' },
  { nome: 'Vitamina B12', tuss: '' },
  { nome: 'Ácido Fólico', tuss: '' },
  { nome: 'Radiografia de Tórax PA/Perfil', tuss: '' },
  { nome: 'Radiografia de Coluna Cervical', tuss: '' },
  { nome: 'Radiografia de Coluna Lombar', tuss: '' },
  { nome: 'Radiografia de Mão e Punho', tuss: '' },
  { nome: 'Radiografia de Joelho', tuss: '' },
  { nome: 'Radiografia de Seios da Face', tuss: '' },
  { nome: 'Ultrassom de Abdome Total', tuss: '' },
  { nome: 'Ultrassom de Abdome Superior', tuss: '' },
  { nome: 'Ultrassom Pélvico', tuss: '' },
  { nome: 'Ultrassom Transvaginal', tuss: '' },
  { nome: 'Ultrassom Obstétrico', tuss: '' },
  { nome: 'Ultrassom Morfológico', tuss: '' },
  { nome: 'Ultrassom de Tireoide', tuss: '' },
  { nome: 'Ultrassom de Mama Bilateral', tuss: '' },
  { nome: 'Ultrassom de Próstata', tuss: '' },
  { nome: 'Ultrassom Renal', tuss: '' },
  { nome: 'Ultrassom Doppler Carótidas', tuss: '' },
  { nome: 'Ultrassom Doppler Venoso MMII', tuss: '' },
  { nome: 'Ultrassom Doppler Arterial MMII', tuss: '' },
  { nome: 'Ultrassom de Partes Moles', tuss: '' },
  { nome: 'TC de Crânio', tuss: '' },
  { nome: 'TC de Tórax', tuss: '' },
  { nome: 'TC de Abdome Total', tuss: '' },
  { nome: 'TC de Coluna Lombar', tuss: '' },
  { nome: 'TC de Seios da Face', tuss: '' },
  { nome: 'Angiotomografia Coronariana', tuss: '' },
  { nome: 'RM de Crânio', tuss: '' },
  { nome: 'RM de Coluna Cervical', tuss: '' },
  { nome: 'RM de Coluna Lombar', tuss: '' },
  { nome: 'RM de Joelho', tuss: '' },
  { nome: 'RM de Ombro', tuss: '' },
  { nome: 'RM de Abdome', tuss: '' },
  { nome: 'RM de Pelve', tuss: '' },
  { nome: 'RM Cardíaca', tuss: '' },
  { nome: 'Mamografia Bilateral', tuss: '' },
  { nome: 'Densitometria Óssea', tuss: '' },
  { nome: 'Eletrocardiograma (ECG)', tuss: '40101010' },
  { nome: 'Ecocardiograma Transtorácico', tuss: '' },
  { nome: 'Ecocardiograma com Doppler', tuss: '' },
  { nome: 'Teste Ergométrico', tuss: '40101045' },
  { nome: 'Holter 24h', tuss: '' },
  { nome: 'MAPA 24h', tuss: '' },
  { nome: 'Eletroencefalograma (EEG)', tuss: '' },
  { nome: 'Eletroneuromiografia (ENMG)', tuss: '' },
  { nome: 'Espirometria', tuss: '' },
  { nome: 'Polissonografia', tuss: '' },
  { nome: 'Tonometria', tuss: '' },
  { nome: 'Campimetria Visual', tuss: '' },
  { nome: 'Retinografia', tuss: '' },
  { nome: 'OCT', tuss: '' },
  { nome: 'Mapeamento de Retina', tuss: '' },
  { nome: 'Audiometria Tonal e Vocal', tuss: '' },
  { nome: 'Impedanciometria', tuss: '' },
  { nome: 'Videolaringoscopia', tuss: '' },
  { nome: 'Papanicolaou', tuss: '' },
  { nome: 'Colposcopia', tuss: '' },
  { nome: 'Endoscopia Digestiva Alta', tuss: '' },
  { nome: 'Colonoscopia', tuss: '' },
  { nome: 'Biópsia de Pele', tuss: '' },
  { nome: 'Anatomopatológico', tuss: '' },
  { nome: 'Gasometria Arterial', tuss: '' },
  { nome: 'Hemoculturas', tuss: '' },
  { nome: 'Antibiograma', tuss: '' },
  { nome: 'D-Dímero', tuss: '' },
  { nome: 'Fibrinogênio', tuss: '' },
  { nome: 'Procalcitonina', tuss: '' },
  { nome: 'Cariótipo', tuss: '' },
];

function ExameCombobox({ value, onChange }: { value: string; onChange: (nome: string, tuss: string) => void }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm) return CATALOGO_EXAMES;
    const q = normalizarTexto(searchTerm.trim());
    return CATALOGO_EXAMES.filter(e => normalizarTexto(e.nome).includes(q) || e.tuss.includes(searchTerm.trim()));
  }, [searchTerm]);

  const isCustomName = searchTerm.trim() && !filtered.some(e => normalizarTexto(e.nome) === normalizarTexto(searchTerm.trim()));

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
const parseMoney = (value: string | number) => {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
};
const temMaisDeDuasCasasDecimais = (valor: number) =>
  Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-7;

// ─── Internal/Particular Prices Tab ───
function PrecosInternos() {
  const { user, profile } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [precoParaExcluir, setPrecoParaExcluir] = useState<{ idx: number; nome: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ nome: '', codigo_tuss: '', descricao: '', valor: '', custo: '' });

  const precosQuery = useQuery({
    queryKey: ['precos-exames-internos', user?.id, profile?.clinica_id],
    queryFn: async () => {
      if (!user?.id) return { items: [], updatedAt: null };
      let query = supabase
        .from('configuracoes_clinica')
        .select('valor, updated_at')
        .eq('chave', 'precos_exames_internos');

      query = profile?.clinica_id
        ? query.eq('clinica_id', profile.clinica_id)
        : query.eq('user_id', user.id).is('clinica_id', null);
      query = query.order('updated_at', { ascending: false }).limit(1);

      const { data, error } = await query;
      if (error) throw error;
      return {
        items: (data?.[0]?.valor as any[]) || [],
        updatedAt: data?.[0]?.updated_at ?? null,
      };
    },
    enabled: !!user?.id,
  });
  const precos = precosQuery.data?.items ?? [];
  const { isLoading } = precosQuery;

  const saveAll = async (list: any[]) => {
    if (precosQuery.isError || precosQuery.isFetching) throw new Error('A tabela não foi carregada por completo. Atualize os dados antes de salvar para não substituir preços existentes.');
    if (!user?.id) throw new Error('Usuário não identificado');
    if (profile?.clinica_id) {
      // Tabela de preços é da clínica: uma linha só, compartilhada pela equipe.
      await salvarConfigClinica({
        clinicaId: profile.clinica_id,
        userId: user.id,
        chave: 'precos_exames_internos',
        valor: list,
        expectedUpdatedAt: precosQuery.data?.updatedAt ?? null,
      });
    } else {
      const { error } = await supabase.from('configuracoes_clinica').upsert({
        chave: 'precos_exames_internos',
        user_id: user.id,
        clinica_id: null,
        valor: list as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,chave' });
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ['precos-exames-internos'] });
  };

  const handleSave = async () => {
    const valor = parseMoney(form.valor);
    const custo = form.custo ? parseMoney(form.custo) : 0;
    if (!form.nome.trim() || !form.valor) { toast.error('Preencha nome e valor'); return; }
    if (!Number.isFinite(valor) || valor <= 0) { toast.error('Informe um valor válido maior que zero'); return; }
    if (!Number.isFinite(custo) || custo < 0) { toast.error('Informe um custo válido'); return; }
    if (temMaisDeDuasCasasDecimais(valor) || temMaisDeDuasCasasDecimais(custo)) { toast.error('Informe valor e custo com no máximo duas casas decimais.'); return; }
    const nomeNormalizado = normalizarTexto(form.nome.trim());
    const codigoNormalizado = form.codigo_tuss.trim().toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '');
    const duplicado = precos.some((preco: any, index: number) => index !== editIdx && (
      normalizarTexto(preco.nome) === nomeNormalizado ||
      (codigoNormalizado && String(preco.codigo_tuss || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '') === codigoNormalizado)
    ));
    if (duplicado) {
      toast.error('Este nome ou código já está cadastrado na tabela particular. Edite o preço existente para evitar cobranças ambíguas.');
      return;
    }
    const entry = { nome: form.nome.trim(), codigo_tuss: form.codigo_tuss.trim(), descricao: form.descricao.trim(), valor, custo };
    const list = [...precos];
    if (editIdx !== null) list[editIdx] = entry;
    else list.push(entry);
    try {
      setIsSaving(true);
      await saveAll(list);
      toast.success(editIdx !== null ? 'Atualizado!' : 'Cadastrado!');
      setShowForm(false);
      setEditIdx(null);
      setForm({ nome: '', codigo_tuss: '', descricao: '', valor: '', custo: '' });
    } catch (error: any) {
      if (String(error?.message || '').includes('Outra pessoa')) {
        await precosQuery.refetch();
        toast.error(error.message, { description: 'A tabela foi atualizada. Confira os valores atuais antes de tentar novamente.' });
      } else toast.error(error?.message || 'Erro ao salvar exame');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!precoParaExcluir) return;
    const list = precos.filter((_: any, i: number) => i !== precoParaExcluir.idx);
    setIsSaving(true);
    try {
      await saveAll(list);
      toast.success('Removido!');
      setPrecoParaExcluir(null);
    } catch (error: any) {
      if (String(error?.message || '').includes('Outra pessoa')) {
        await precosQuery.refetch();
        toast.error(error.message, { description: 'A tabela foi atualizada. Confira os valores atuais antes de tentar novamente.' });
      } else toast.error(error?.message || 'Erro ao remover exame');
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (idx: number) => {
    const p = precos[idx];
    setEditIdx(idx);
    setForm({ nome: p.nome, codigo_tuss: p.codigo_tuss || '', descricao: p.descricao || '', valor: String(p.valor), custo: String(p.custo || '') });
    setShowForm(true);
  };

  const filtered = useMemo(() => {
    const q = normalizarTexto(search.trim());
    if (!q) return precos;
    return precos.filter((p: any) => normalizarTexto(p.nome).includes(q) || normalizarTexto(p.codigo_tuss).includes(q));
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
              {precosQuery.isError ? (
                <TableRow><TableCell colSpan={7} className="p-4"><ErrorState compact title="Não foi possível carregar a tabela particular" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} /></TableCell></TableRow>
              ) : isLoading ? (
                <TableRow><TableCell colSpan={7} className="p-0"><TableSkeleton rows={5} cols={5} /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{precos.length === 0 ? 'Nenhum exame cadastrado. Clique em “Novo Exame” para começar.' : <>Nenhum exame encontrado para esta busca. <Button variant="link" className="h-auto p-0" onClick={() => setSearch('')}>Limpar busca</Button></>}</TableCell></TableRow>
              ) : (
                filtered.map((p: any) => {
                  const originalIdx = precos.indexOf(p);
                  const margem = Number(p.custo) > 0 && Number(p.valor) > 0
                    ? ((Number(p.valor) - Number(p.custo)) / Number(p.valor) * 100)
                    : null;
                  return (
                    <TableRow key={`${p.nome}-${p.codigo_tuss || 'sem-tuss'}-${originalIdx}`}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_tuss || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{p.descricao || '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(p.valor)}</TableCell>
                      <TableCell className="text-right">{p.custo > 0 ? fmt(p.custo) : '—'}</TableCell>
                      <TableCell className="text-right">
                        {margem === null ? <span className="text-muted-foreground">—</span> : (
                          <Badge variant={margem >= 50 ? 'default' : margem >= 20 ? 'secondary' : 'destructive'} className="text-xs">
                            {margem.toFixed(0)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button aria-label={`Editar preço de ${p.nome}`} size="icon" variant="ghost" onClick={() => openEdit(originalIdx)}><Edit className="h-3 w-3" /></Button>
                          <Button aria-label={`Excluir preço de ${p.nome}`} size="icon" variant="ghost" className="text-destructive" disabled={isSaving} onClick={() => setPrecoParaExcluir({ idx: originalIdx, nome: p.nome })}><Trash2 className="h-3 w-3" /></Button>
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
              <ExameCombobox value={form.nome} onChange={(nome, tuss) => setForm(p => ({ ...p, nome, codigo_tuss: tuss }))} />
              <p className="text-xs text-muted-foreground">
                Só preenchemos códigos conferidos na tabela oficial. Nos demais casos, consulte e confirme a vigência na{' '}
                <a href="https://consulta-ocl.apps.sa-1a.mendixcloud.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                  consulta oficial TUSS da ANS <ExternalLink className="h-3 w-3" />
                </a>{' '}antes de faturar.
              </p>
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
            <Button onClick={handleSave} disabled={!form.nome || !form.valor || isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editIdx !== null ? 'Salvar Alterações' : 'Cadastrar Exame'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog
        open={!!precoParaExcluir}
        onOpenChange={(open) => { if (!open && !isSaving) setPrecoParaExcluir(null); }}
        itemName={precoParaExcluir?.nome || ''}
        isLoading={isSaving}
        closeOnConfirm={false}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

// ─── Convênio Prices Tab ───
function PrecosConvenio() {
  const { profile } = useSupabaseAuth();
  const [search, setSearch] = useState('');
  const [filterConvenio, setFilterConvenio] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  /** Remover preço ficava a um clique, sem confirmar nem permitir desfazer. */
  const [precoParaExcluir, setPrecoParaExcluir] = useState<any>(null);
  const queryClient = useQueryClient();

  const conveniosQuery = useQuery({
    queryKey: ['convenios-precos', profile?.clinica_id ?? null],
    queryFn: async () => {
      let query = supabase.from('convenios').select('id, nome, codigo').eq('ativo', true).order('nome');
      if (profile?.clinica_id) query = query.eq('clinica_id', profile.clinica_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.clinica_id,
  });
  const convenios = conveniosQuery.data ?? [];

  const precosQuery = useQuery({
    queryKey: ['precos-exames', profile?.clinica_id],
    queryFn: async () => {
      return buscarEmBlocos<any>(() => supabase
        .from('precos_exames_convenio')
        .select('*, convenios(nome, codigo)')
        .eq('clinica_id', profile?.clinica_id)
        .order('tipo_exame').order('id'));
    },
    enabled: !!profile?.clinica_id,
  });
  const precos = precosQuery.data ?? [];
  const precosAtingiramLimite = precos.length >= LIMITE_BUSCA_EM_BLOCOS;
  const { isLoading } = precosQuery;

  const saveMutation = useMutation({
    mutationFn: async (form: any) => {
      const valorTabela = parseMoney(form.valor_tabela);
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
      if (conveniosQuery.isError || precosQuery.isError || conveniosQuery.isLoading || precosQuery.isLoading) throw new Error('Carregue convênios e preços antes de gravar.');
      if (precosAtingiramLimite) throw new Error('A lista de preços atingiu o limite de leitura. Não é possível validar duplicidade com segurança; revise a tabela antes de cadastrar.');
      if (!convenios.some((convenio: any) => convenio.id === form.convenio_id) || !form.tipo_exame?.trim() || !Number.isFinite(valorTabela) || valorTabela <= 0) {
        throw new Error('Preencha convênio, exame e valor válido maior que zero.');
      }
      const adicionais = ['valor_filme', 'valor_custo', 'valor_repasse'].map((key) => form[key] ? parseMoney(form[key]) : 0);
      if (adicionais.some((valor) => !Number.isFinite(valor) || valor < 0)) throw new Error('Filme, custo e repasse devem ser valores válidos iguais ou maiores que zero.');
      if ([valorTabela, ...adicionais].some(temMaisDeDuasCasasDecimais)) throw new Error('Informe os valores do convênio com no máximo duas casas decimais.');
      const nomeNormalizado = normalizarTexto(form.tipo_exame.trim());
      const codigoNormalizado = String(form.codigo_tuss || '').trim().toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '');
      const duplicado = precos.some((preco: any) => preco.id !== editing?.id && preco.convenio_id === form.convenio_id && (
        normalizarTexto(preco.tipo_exame) === nomeNormalizado ||
        (codigoNormalizado && String(preco.codigo_tuss || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '') === codigoNormalizado)
      ));
      if (duplicado) throw new Error('Este nome ou código já está cadastrado para o convênio selecionado. Edite o preço existente para evitar cobranças ambíguas.');
      const payload = {
        convenio_id: form.convenio_id, tipo_exame: form.tipo_exame.trim(), codigo_tuss: form.codigo_tuss?.trim() || null,
        descricao: form.descricao?.trim() || null, valor_tabela: valorTabela, valor_filme: form.valor_filme ? parseMoney(form.valor_filme) : 0,
        valor_custo: form.valor_custo ? parseMoney(form.valor_custo) : 0, valor_repasse: form.valor_repasse ? parseMoney(form.valor_repasse) : 0,
        clinica_id: profile.clinica_id,
      };
      if (editing) {
        if (!editing.updated_at) throw new Error('Não foi possível confirmar a versão deste preço. Feche e abra o registro novamente antes de editar.');
        const { data, error } = await supabase.from('precos_exames_convenio').update(payload)
          .eq('id', editing.id).eq('clinica_id', profile.clinica_id).eq('updated_at', editing.updated_at)
          .select('id, updated_at').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Este preço foi alterado ou removido em outra sessão. Seus dados continuam no formulário; atualize a tabela e compare antes de salvar novamente.');
      } else {
        const { error } = await supabase.from('precos_exames_convenio').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precos-exames'] });
      toast.success(editing ? 'Preço atualizado!' : 'Preço cadastrado!');
      setShowNew(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message?.includes('unique') ? 'Já existe preço para este exame neste convênio' : (e.message || 'Erro ao salvar')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.clinica_id) throw new Error('Clínica não identificada. Recarregue a página e tente novamente.');
      const { data, error } = await supabase.from('precos_exames_convenio').delete()
        .eq('id', id).eq('clinica_id', profile.clinica_id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precos-exames'] });
      toast.success('Removido');
      setPrecoParaExcluir(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const filtered = precos?.filter((p: any) => {
    const q = normalizarTexto(search.trim());
    const matchSearch = normalizarTexto(p.tipo_exame).includes(q) ||
      normalizarTexto(p.codigo_tuss).includes(q);
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

      {precosAtingiramLimite && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>A lista de preços por convênio atingiu o limite de {LIMITE_BUSCA_EM_BLOCOS.toLocaleString('pt-BR')} itens.</p></div>}
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
              {conveniosQuery.isError ? (
                <TableRow><TableCell colSpan={9} className="p-4"><ErrorState compact title="Não foi possível carregar os convênios" error={conveniosQuery.error} onRetry={() => void conveniosQuery.refetch()} /></TableCell></TableRow>
              ) : precosQuery.isError ? (
                <TableRow><TableCell colSpan={9} className="p-4"><ErrorState compact title="Não foi possível carregar os preços" error={precosQuery.error} onRetry={() => void precosQuery.refetch()} /></TableCell></TableRow>
              ) : isLoading || conveniosQuery.isLoading ? (
                <TableRow><TableCell colSpan={9} className="p-0"><TableSkeleton rows={5} cols={6} /></TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">{precos.length === 0 ? 'Nenhum preço cadastrado. Clique em “Novo Preço” para começar.' : <>Nenhum preço encontrado com estes filtros. <Button variant="link" className="h-auto p-0" onClick={() => { setSearch(''); setFilterConvenio('all'); }}>Limpar busca e convênio</Button></>}</TableCell></TableRow>
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
                        <Button aria-label={`Editar preço de ${p.tipo_exame}`} size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Remover preço de ${p.tipo_exame}`} onClick={() => setPrecoParaExcluir(p)}><Trash2 className="h-3 w-3" /></Button>
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

      {precoParaExcluir && (
        <DeleteConfirmDialog
          open
          onOpenChange={(o) => { if (!o && !deleteMutation.isPending) setPrecoParaExcluir(null); }}
          itemName={precoParaExcluir.tipo_exame}
          isLoading={deleteMutation.isPending}
          closeOnConfirm={false}
          onConfirm={() => deleteMutation.mutate(precoParaExcluir.id)}
        />
      )}
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
