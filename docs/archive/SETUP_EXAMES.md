# Historico: setup de exames laboratoriais com precos

Este procedimento manual foi substituido pela migration
`supabase/migrations/20260413225100_add_exam_pricing.sql`. Nao execute o SQL
abaixo no banco atual. O deploy de producao usa o Supabase na VPS.

## 📋 Estrutura Implementada

### Novos Campos na Tabela `exames`:
- `tipo_categorizado` - Tipo de exame (laboratorial, imagem, ultrassom, etc)
- `laboratorio_id` - Referência ao laboratório/fornecedor
- `preco_custo` - Preço de custo do exame
- `preco_venda` - Preço de venda para o paciente
- `categoria` - Categoria do exame (geral, cardio, ortopedia, etc)

### Novas Tabelas:

#### `laboratorios` (Fornecedores/Laboratórios)
```sql
- id (UUID)
- nome (obrigatório)
- cnpj
- telefone
- email
- endereco
- clinica_id (ligado à clínica)
- ativo (boolean)
```

#### `tipo_exames_catalog` (Catálogo de exames)
```sql
- id (UUID)
- nome (ex: "Hemograma Completo")
- categoria (ex: "Hematologia")
- codigo_tuss (código TUSS)
- preco_custo (o quanto custa fazer/importar o exame)
- preco_venda (o quanto cobrar do paciente)
- laboratorio_id (qual laboratório faz)
- clinica_id (qual clínica)
- descricao
- ativo
```

## 🔴 Executar Migração

Execute o SQL no Supabase:

https://supabase.com/dashboard/project/gebygucrpipaufrlyqqj/sql

```sql
-- Tabela de laboratórios/fornecedores
CREATE TABLE IF NOT EXISTS public.laboratorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  telefone text,
  email text,
  endereco text,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.laboratorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinica acessa seus laboratorios" ON public.laboratorios
  FOR ALL
  USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- Tabela de tipos de exames (para categorização)
CREATE TABLE IF NOT EXISTS public.tipo_exames_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL,
  codigo_tuss text,
  preco_custo numeric(10,2),
  preco_venda numeric(10,2),
  laboratorio_id uuid REFERENCES public.laboratorios(id) ON DELETE SET NULL,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  descricao text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tipo_exames_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinica acessa seu catalogo" ON public.tipo_exames_catalog
  FOR ALL
  USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- Adicionar colunas na tabela exames
ALTER TABLE public.exames
ADD COLUMN IF NOT EXISTS tipo_categorizado text DEFAULT 'laboratorial',
ADD COLUMN IF NOT EXISTS laboratorio_id uuid REFERENCES public.laboratorios(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS preco_custo numeric(10,2),
ADD COLUMN IF NOT EXISTS preco_venda numeric(10,2),
ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'geral';

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_laboratorios_clinica ON public.laboratorios(clinica_id);
CREATE INDEX IF NOT EXISTS idx_tipo_exames_clinica ON public.tipo_exames_catalog(clinica_id);
CREATE INDEX IF NOT EXISTS idx_exames_laboratorio ON public.exames(laboratorio_id);
```

## ✅ Após Executar:

1. Recarregue o app (F5)
2. Em **Exames** → novo botão "Gerenciar Laboratórios"
3. Cadastre seus laboratórios/fornecedores
4. Ao adicionar novo exame, aparecerá:
   - Tipo (Laboratorial, Imagem, Ultrassom, etc)
   - Laboratório (dropdown com seus fornecedores)
   - Preço de custo
   - Preço de venda

## 💰 Fluxo de Preços:

```
Exemplo:
├─ Hemograma Completo
   ├─ Laboratório: Diagnósticos Brasil
   ├─ Preço de Custo: R$ 25.00 (o que você paga)
   ├─ Preço de Venda: R$ 60.00 (o que cobra do paciente)
   └─ Margem: R$ 35.00 (lucro)
```

