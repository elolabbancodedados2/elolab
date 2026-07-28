# Como aplicar as migrations pendentes

Onze migrations desta revisão aguardam aplicação. Nenhuma correção está
protegendo a clínica enquanto isso não for feito — o código foi mergeado, o
banco não mudou.

Rode pelo **SQL Editor** do Supabase, **uma por vez e nesta ordem**. O nome do
arquivo já define a ordem (é o timestamp), então basta seguir de cima para
baixo.

---

## Antes de começar — duas checagens

**1. Quem é platform admin?** As migrations 1 e 2 passam a exigir essa tabela.

```sql
SELECT pa.user_id, p.email, pa.nivel, pa.ativo
  FROM public.platform_admins pa
  JOIN public.profiles p ON p.id = pa.user_id;
```

Se `contato@elolab.com.br` não aparecer com `ativo = true`, a tela
`/painel-admin` para de salvar alterações de assinatura depois da migration 1.

**2. Há agendamentos sobrepostos?** A migration 7 se recusa a rodar se houver.
A consulta que lista os conflitos está no rodapé daquele arquivo.

---

## Ordem de aplicação

| # | Arquivo | O que resolve |
|---|---|---|
| 1 | `20260727230000_security_fixes_c1_c4.sql` | Isolamento entre clínicas, storage, convites, planos |
| 2 | `20260727234500_c5_paywall_servidor.sql` | Assinatura vencida em modo somente leitura |
| 3 | `20260727235000_cron_segredo_proprio.sql` | ⚠️ **exige passo manual, veja abaixo** |
| 4 | `20260728010000_lancamentos_valor_recebido.sql` | Receita deixa de ignorar descontos |
| 5 | `20260728020000_baixa_estoque_idempotente.sql` | 🔴 **estoque drenando agora** |
| 6 | `20260728120000_corrige_politicas_storage_e_convite.sql` | Corrige políticas que não casavam |
| 7 | `20260728140000_agenda_sem_dupla_marcacao.sql` | Impede dois pacientes no mesmo horário |
| 8 | `20260728160000_tv_panel_media_por_clinica.sql` | Painel TV escopado por clínica |
| 9 | `20260728170000_triagem_altura_em_cm.sql` | Triagem volta a salvar |
| 10 | `20260728180000_alinha_checks_com_o_app.sql` | Recepção, encaminhamentos e auditoria de acesso |
| 11 | `20260728150000_patient_photos_privado.sql` | ⚠️ **só depois do deploy do frontend** |

> A número 11 está fora de ordem de propósito: ela fecha o bucket de fotos, e
> as fotos somem das telas se o frontend ainda não estiver publicado com o
> código que gera link assinado.

---

## Passo manual da migration 3

O cron chama as edge functions com a chave `anon`, que é pública. Antes de rodar:

```sql
-- 1. Gere o segredo e copie o resultado
SELECT encode(gen_random_bytes(32), 'hex');
```

```bash
# 2. Guarde-o nos secrets das edge functions
supabase secrets set CRON_SECRET='<valor gerado>'
# (ou pelo painel: Edge Functions → Secrets)
```

3. Substitua `COLE_O_SEGREDO_AQUI` no arquivo pelo mesmo valor e execute.

A migration se recusa a rodar se você esquecer. As funções falham aberto
enquanto `CRON_SECRET` não existir, então não há janela de indisponibilidade.

---

## Deploy das edge functions

Depois das migrations:

```bash
supabase functions deploy send-employee-invitation patient-portal \
  whatsapp-webhook process-notification-queue send-appointment-reminder \
  stock-alert birthday-greetings monthly-report-generator payment-reminder
```

---

## Depois de aplicar — o que conferir

1. **Login e 2FA** — ativar em `/seguranca`, sair e entrar. É o caminho de maior
   risco. Se travar, remova o fator pelo painel (Authentication → Users).
2. **Triagem** — salvar uma com altura de adulto (ex.: 170 cm).
3. **Recepção** — levar um paciente até o último passo e ver se ele sai da fila.
4. **Encaminhamento** — criar pelo prontuário e conferir se aparece na lista.
5. **Agenda** — marcar duas consultas seguidas para o mesmo médico (09:00–09:30
   e 09:30–10:00). Devem ser aceitas.
6. **Fotos** — só depois da 11: abrir a ficha de um paciente com foto.

---

## O estrago que já aconteceu não se desfaz sozinho

Duas migrations trazem consultas de diagnóstico no rodapé:

- **`20260728020000`** — lista itens de estoque com baixas repetidas pelo
  autosave. O saldo **não** é recomposto automaticamente; onde houver rastro, o
  ajuste é por inventário.
- **`20260728010000`** — mostra quantos recebimentos tiveram desconto gravado
  apenas como texto em `observacoes`. Esses não dá para recuperar com confiança.
