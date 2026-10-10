# Produção EloLab — Easypanel e Supabase auto-hospedado

Este documento descreve a produção atual e o procedimento para publicar mudanças.

## E-mail transacional EloLab

A configura??o da Brevo (envio das Edge Functions, SMTP do Auth, modelos e DNS) est? em [`docs/BREVO_EMAIL_SETUP.md`](BREVO_EMAIL_SETUP.md). Configure `BREVO_API_KEY` somente no servi?o de Edge Functions e as vari?veis `GOTRUE_SMTP_*` somente no servi?o Auth do Compose. N?o grave segredos no frontend nem no reposit?rio. Preserve os registros MX existentes.

## Arquitetura

O EloLab roda em dois serviços do Easypanel na VPS:

1. **Supabase self-hosted**: template/stack Docker Compose oficial do Supabase, com o
   domínio `api.elolab.com.br`.
2. **EloLab frontend**: aplicação Docker deste repositório, com o domínio
   `app.elolab.com.br` e porta interna `8080`. O domínio raiz também serve a
   landing page.

O domínio da API é `api.elolab.com.br`, e o container do frontend usa essa URL
como `VITE_SUPABASE_URL`. O DNS aponta diretamente para a VPS. O serviço
`elolab/app` e o stack Supabase `elolab_supabase` pertencem a este projeto; há
outro stack Supabase na mesma VPS, então comandos operacionais devem sempre
identificar o container do EloLab explicitamente.

O frontend recebe apenas `VITE_SUPABASE_URL` e a chave publishable/anon durante
o build. `SERVICE_ROLE_KEY`, senha do Postgres, JWT secret e chaves de serviços
externos ficam exclusivamente no recurso do Supabase/Edge Functions e nunca no
container do frontend.

## Pré-requisitos da VPS

Para o stack completo, use no mínimo 4 GB de RAM, 2 vCPUs e 40 GB SSD; 8 GB,
4 vCPUs e 80 GB SSD são preferíveis. A operação passa a incluir atualizações,
firewall, backups, monitoramento e recuperação do Postgres. O Supabase
self-hosted é um único projeto e não oferece os backups gerenciados/PITR do
serviço Cloud.

## Ordem de implantação

### 1. Easypanel

Instale o Easypanel na VPS Ubuntu/Debian e configure domínio, e-mail SMTP e
backup do próprio painel. Libere somente SSH, HTTP e HTTPS no firewall; não
exponha Postgres, Redis ou os serviços internos do Supabase diretamente à
internet.

### 2. Supabase

No Easypanel, crie um serviço **Compose** usando o template Supabase disponível
ou o diretório `docker/` de uma release fixada do repositório oficial
`supabase/supabase`. Copie `.env.example`
para `.env`, gere todos os secrets e defina:

```text
SUPABASE_PUBLIC_URL=https://api.elolab.com.br
API_EXTERNAL_URL=https://api.elolab.com.br
SITE_URL=https://app.elolab.com.br
ADDITIONAL_REDIRECT_URLS=https://app.elolab.com.br/**
```

Não suba o stack com os placeholders do `.env.example`. Use a opção oficial de
geração de chaves e fixe a release instalada para permitir upgrades controlados.
No Easypanel, persista os volumes do Postgres e Storage e configure backup
off-site criptografado antes de importar dados.

### 3. Banco, Storage e funções

Para uma instalação nova, aplique as migrações versionadas em
`supabase/migrations` uma única vez, na ordem dos timestamps. Para migração do
projeto Cloud existente, faça janela de manutenção, gere backup completo e
restaure banco, usuários do Auth e objetos do Storage; não trate `db push` como
backup nem execute migrações duas vezes.

As funções em `supabase/functions` devem ser copiadas para o volume de funções
do stack self-hosted. Configure no serviço de Edge Functions os secrets usados
no código (Mercado Pago, e-mail, WhatsApp, OpenAI, `CRON_SECRET` etc.). Depois
reinicie/recrie o serviço de funções. Revise também os agendadores: cron do
Supabase Cloud não é transferido automaticamente para a VPS.

### 4. Frontend EloLab

Crie um serviço **App** no Easypanel apontando para este repositório,
branch `main`, usando o `Dockerfile` da raiz. Configure:

```text
VITE_SUPABASE_URL=https://api.elolab.com.br
VITE_SUPABASE_PUBLISHABLE_KEY=<anon ou publishable key do self-hosted>
```

Essas variáveis precisam estar disponíveis no ambiente de build do Easypanel,
pois o Vite as incorpora no bundle. Defina a porta `8080`, health check
`/healthz` e domínio HTTPS `app.elolab.com.br`. Não é necessário volume no
frontend.

**Não habilite Auto Deploy direto do branch `main` sem proteção de branch.** O
webhook Git do Easypanel não aguarda o resultado do GitHub Actions: pode iniciar
um deploy antes de typecheck, verificações, testes, auditoria e build terminarem.
Antes de habilitar o deploy automático, configure proteção de `main` no GitHub
para exigir aprovação por PR e o check `Validate image for Easypanel / validate`.
Depois, confirme no painel que o gatilho de deploy só aceita commits já
integrados em `main`. Se essa proteção não estiver disponível, mantenha Auto
Deploy desligado e publique manualmente somente após o CI verde.

## Publicar mudanças na produção

1. Abrir PR e aguardar o workflow `Validate image for Easypanel` ficar verde.
2. Exigir esse check na proteção da branch `main` antes de integrar mudanças.
3. Aplicar migrations e publicar Edge Functions em janela planejada, com
   backup verificado e rollback definido.
4. Confirmar que o Auto Deploy do Easypanel só recebe commits já validados.
   O webhook Git direto pode começar o deploy antes do CI; mantenha-o desligado
   até existir esse bloqueio.
5. Após publicar, conferir `/healthz`, login, fluxos críticos e logs do serviço
   `elolab/app`.

## Pendências de configuração observadas

- A branch `main` ainda não tem proteção que exija CI; o acesso disponível ao
  GitHub não tem permissão administrativa para configurá-la.
- O certificado HTTPS e a rota de `www.elolab.com.br` precisam ser corrigidos
  no DNS/Easypanel; o domínio raiz deve ser validado separadamente.
- Razão social, CNPJ do fornecedor, encarregado de dados e condições de backup
  precisam estar corretos nos documentos e na proposta antes de vender o SaaS.

## Referências operacionais

- Supabase: https://supabase.com/docs/guides/self-hosting/docker
- Easypanel App: https://easypanel.io/docs/services/app
- Easypanel Compose: https://easypanel.io/docs/services/compose
- Template Supabase do Easypanel: https://easypanel.io/docs/templates/supabase
- A CSP aplicada pelo Nginx fica em `docker/security-headers.conf` e já inclui
  `api.elolab.com.br`. Se outro domínio for escolhido, atualize a CSP antes do
  deploy.
