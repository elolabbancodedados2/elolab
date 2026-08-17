# EloLab — Sistema de Gestão Clínica

Sistema de gestão para clínicas médicas e laboratórios, multi-tenant (cada clínica é um inquilino isolado). Stack: React 18 + TypeScript + Tailwind + shadcn/ui + Supabase + Framer Motion.

## 🚀 Módulos

Sete telas reúnem módulos em abas. As rotas antigas continuam funcionando como
redirecionamento, então links salvos não quebram — mas o destino real é a tela
unificada indicada abaixo.

### Atendimento

| Módulo | Rota | Descrição |
|---|---|---|
| Dashboard | `/dashboard` | KPIs, sparklines, resumo do dia |
| Agenda | `/agenda` | Grade semanal + lista, recorrência, bloqueios, disponibilidade por médico |
| Fila / Triagem | `/fila` | **2 abas:** fila de atendimento · triagem (protocolo de Manchester, sinais vitais, IMC) |
| Recepção & Caixa | `/recepcao` | **2 abas:** check-in e pagamento · abertura/fechamento de caixa |
| Salas & Espera | `/gestao-fluxo` | **2 abas:** salas · lista de espera |
| Painel TV | `/painel-tv` | Chamada de senha para a sala de espera |
| Chat Interno | `/chat` | Conversas em tempo real entre a equipe |

### Pacientes e clínica

| Módulo | Rota | Descrição |
|---|---|---|
| Pacientes | `/pacientes` | CRUD, CEP, alergias, responsável legal, foto, timeline, autorizações de convênio |
| Retornos | `/retornos` | Controle de retornos e alertas de atraso |
| Convênios | `/convenios` | Planos, valores e carência |
| Prontuários | `/prontuarios` | SOAP, CID-10, evoluções, anexos, assinatura digital |
| Documentos Clínicos | `/documentos-clinicos` | **3 abas:** prescrições · atestados · encaminhamentos |
| Exames | `/exames` | Solicitação com TUSS, anexos, urgência |
| Gráficos de Vitais | `/vitais-graficos` | Evolução de sinais vitais por paciente |

### Laboratório

| Módulo | Rota | Descrição |
|---|---|---|
| Painel Lab | `/laboratorio` | Worklist, coletas, resultados |
| Mapa de Coleta | `/mapa-coleta` | Tubos por material biológico, ordem FIFO, tempo real |
| Guias Externas | `/guias-externas` | Recebimento por portal público com token |
| Laudos | `/laudos-lab` | Liberação por exame, PDF |

### Financeiro

| Módulo | Rota | Descrição |
|---|---|---|
| Visão Geral | `/financeiro` | KPIs, DRE, gráficos |
| Contas | `/contas` | **2 abas:** a receber · a pagar |
| Fluxo de Caixa | `/fluxo-caixa` | Visão diária e mensal |
| Preços & Serviços | `/precos-servicos` | **2 abas:** preços de exames por convênio · tipos de consulta |
| Relatórios | `/relatorios` · `/relatorios/salvos` | Relatórios customizados, agendados e export |
| Cobrança | `/cobranca-inadimplentes` | Régua de cobrança |
| Pagamentos | `/pagamentos` | Integração MercadoPago |

### Operacional e administração

| Módulo | Rota | Descrição |
|---|---|---|
| Equipe | `/equipe` | **3 abas:** médicos · funcionários · convites |
| Estoque | `/estoque` | Controle com alerta de estoque baixo |
| Templates | `/todos-templates` | **2 abas:** templates de prontuário · de e-mail |
| Tarefas | `/tarefas` | Tarefas internas com prioridade |
| Analytics | `/analytics` | Métricas e tendências |
| Análise Preditiva | `/analise-preditiva` | Previsão de demanda |
| Agente IA WhatsApp | `/agente-ia` | Atendimento automatizado (ver ⚠️ abaixo) |
| Automações | `/automacoes` | Regras disparadas pelo banco |
| Configurações | `/configuracoes` | Configurações da clínica |
| Configurações Avançadas | `/configuracoes-avancadas` | Status, integrações, especialidades, documentos, LGPD |
| Direitos LGPD | `/lgpd-pacientes` | Portabilidade, correção e exclusão a pedido do titular |
| Segurança da Conta | `/seguranca` | 2FA e encerramento de sessões |

### Portais públicos

| Módulo | Rota |
|---|---|
| Portal do Paciente | `/portal-paciente` (acesso por token) |
| Portal de Guias | `/portal-guias/:token` |

## 🔧 Setup

```bash
npm install
npm run dev
```

Variáveis necessárias (`.env`, **não versionado**):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

## ✅ Qualidade

```bash
npm run test:run     # 440 testes unitários e de integração
npm run test:e2e     # Playwright: RLS, autorização das edge functions e varredura dos módulos
npx tsc --noEmit -p tsconfig.app.json
npm run lint
```

O CI roda typecheck, lint e testes a cada push em `dev` e PR para `main`.

O deploy é automatizado por `.github/workflows/deploy.yml` — cada push na
`main` gera um novo bundle no Cloudflare Pages (`app.elolab.com.br`).

**Isolamento entre clínicas** tem suíte própria, que só roda com duas contas
reais em clínicas diferentes — sem elas os testes são pulados, nunca passam em
falso:

```bash
CLINICA_A_EMAIL=... CLINICA_A_SENHA=... \
CLINICA_B_EMAIL=... CLINICA_B_SENHA=... \
npm run test:e2e -- tests/isolamento-entre-clinicas.spec.ts
```

Se o download do browser do Playwright falhar (CDN bloqueada, proxy), aponte um
Chromium já instalado com `PLAYWRIGHT_CHROMIUM_PATH=/caminho/para/chrome`.

## 🔒 Segurança

- **RLS por clínica** em todas as tabelas operacionais, via `is_same_clinica()`.
- **Papéis** (`admin`, `medico`, `recepcao`, `enfermagem`, `financeiro`) ficam em
  tabela separada (`user_roles`), consultada por funções `SECURITY DEFINER`.
- **2FA** usa o MFA nativo do Supabase (validação no servidor, fator no JWT).
- **Cabeçalhos HTTP** (CSP, HSTS, `frame-ancestors: none`) configurados em `public/_headers` — o Cloudflare Pages serve estes cabeçalhos em cada resposta.
- **Assinatura vencida** deixa o sistema em modo somente leitura, aplicado por
  trigger no banco — não apenas no navegador.
- Nunca comite o `.env`. Se uma chave vazar, rotacione em
  Supabase Dashboard → Settings → API.

### ⚠️ Pontos de atenção

- **O sistema não assina documento digitalmente.** Receita, atestado e guia de
  exame saem sem assinatura — o médico assina de próprio punho após imprimir, ou
  assina o PDF no assinador gov.br. Não há integração com ICP-Brasil nem Memed.
  A tela dizia o contrário: o atestado se declarava "assinado digitalmente via
  Memed" e havia um botão que pedia o PIN do certificado do médico, descartava o
  PIN e marcava o documento como assinado por certificado. Foi removido. A
  assinatura do **prontuário** existe e funciona, mas é eletrônica simples (fecha
  para edição e registra autor, CRM, data e hash), o que atende a CFM 1.821/07 —
  não é ICP-Brasil.
- **A IA usa OpenAI** (`api.openai.com`), tanto no apoio à decisão clínica quanto
  no agente de WhatsApp. Conteúdo de conversas e texto clínico sai para um
  provedor no exterior — sob a LGPD isso é transferência internacional de dado
  sensível de saúde e exige base legal e cláusulas contratuais próprias. O
  endpoint clínico agora exige papel de médico, restringe por clínica e registra
  cada envio na auditoria, mas isso não substitui o DPA. Avalie com o jurídico
  antes de divulgar.
- **O sistema não emite nota fiscal.** A NF da clínica sai pelo contador. O
  módulo que existia era apenas um registro manual, sem envio à SEFAZ, e foi
  removido para não gerar digitação duplicada.

## 📱 PWA

App instalável. Assets estáticos são cacheados; **dados clínicos e arquivos de
paciente não são** — e os caches são limpos no logout, para não deixar rastro em
computador compartilhado.

## 🎨 Design System

- **Cores**: primária azul-teal, sucesso verde esmeralda, warning âmbar, destrutivo coral
- **Tipografia**: Inter (corpo) + Plus Jakarta Sans (títulos)
- **Animações**: Framer Motion
- **Temas**: claro e escuro
