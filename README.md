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
npm run test:run     # 173 testes unitários e de integração
npm run test:e2e     # Playwright (inclui verificação de RLS)
npx tsc --noEmit -p tsconfig.app.json
npm run lint
```

O CI roda typecheck, lint e testes a cada push em `dev` e PR para `main`.

## 🔒 Segurança

- **RLS por clínica** em todas as tabelas operacionais, via `is_same_clinica()`.
- **Papéis** (`admin`, `medico`, `recepcao`, `enfermagem`, `financeiro`) ficam em
  tabela separada (`user_roles`), consultada por funções `SECURITY DEFINER`.
- **2FA** usa o MFA nativo do Supabase (validação no servidor, fator no JWT).
- **Cabeçalhos HTTP** (CSP, HSTS, `frame-ancestors: none`) configurados em `vercel.json`.
- **Assinatura vencida** deixa o sistema em modo somente leitura, aplicado por
  trigger no banco — não apenas no navegador.
- Nunca comite o `.env`. Se uma chave vazar, rotacione em
  Supabase Dashboard → Settings → API.

### ⚠️ Pontos de atenção

- **O agente de WhatsApp usa DeepSeek** (`api.deepseek.com`). Conteúdo de
  conversas com pacientes sai para um provedor no exterior — sob a LGPD isso é
  transferência internacional de dado sensível de saúde e exige base legal e
  cláusulas contratuais próprias. Avalie com o jurídico antes de divulgar.
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
