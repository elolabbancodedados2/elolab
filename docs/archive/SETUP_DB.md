# Historico: setup do banco de dados - caixa diario

Este procedimento manual foi substituido pela migration
`supabase/migrations/20260413223725_caixa_diario_complete.sql`. Nao execute o
SQL abaixo no banco atual. O deploy de producao usa o Supabase na VPS.

## 🔴 Problema

A tabela `caixa_diario` não existe no Supabase e precisa ser criada.

## ✅ Solução

Execute o SQL abaixo no editor SQL do Supabase:

### 📍 Como executar:

1. Acesse: https://supabase.com/dashboard/project/gebygucrpipaufrlyqqj/sql
2. Cole o SQL abaixo
3. Clique em "Run" (Ctrl+Enter)

### 📋 SQL para executar:

```sql
-- Criar tabela caixa_diario com RLS
CREATE TABLE IF NOT EXISTS public.caixa_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  aberto boolean NOT NULL DEFAULT true,
  valor_abertura numeric(10,2) NOT NULL DEFAULT 0,
  valor_fechamento numeric(10,2),
  operador_abertura text,
  operador_fechamento text,
  observacoes text,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(data, clinica_id)
);

-- Enable RLS
ALTER TABLE public.caixa_diario ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Clinica acessa caixa_diario" ON public.caixa_diario;
CREATE POLICY "Clinica acessa caixa_diario" ON public.caixa_diario
  FOR ALL
  USING (clinica_id IN (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()));

-- Index
CREATE INDEX IF NOT EXISTS idx_caixa_diario_data_clinica
  ON public.caixa_diario(data, clinica_id);
```

## ✨ Após executar:

Recarregue a página do app (F5) e o Caixa Diário funcionará normalmente!

