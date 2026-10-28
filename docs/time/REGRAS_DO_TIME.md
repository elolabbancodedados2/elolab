# Regras comuns do time EloLab

Todo agente do time (`.claude/agents/*.md`) lê este arquivo antes de começar. Ele vale junto com `AGENTS.md`.

## Produto
- EloLab: SaaS de gestão para clínicas e laboratórios. Segmentos-alvo: clínicas pequenas e médias, redes multiunidade, laboratórios e odonto/especialidades.
- Estratégia: profissionalizar o produto atual, sem reescrita. A base é o diagnóstico em `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md` e os relatórios em `docs/estrategia/funcoes/`.
- Fora do escopo: telemedicina.
- Visual sóbrio e institucional: uma cor de marca, cores só para estado, sem degradês, emojis ou exclamações, tom formal. Erros sempre traduzidos (`src/lib/erros.ts`).

## Stack e fatos técnicos
- React 18 + Vite + TypeScript + React Query + shadcn/Tailwind. Supabase self-hosted numa VPS com Easypanel. Edge functions em Deno (`supabase/functions`).
- Tenant de um nível por `clinica_id`, com RLS e as helpers `is_same_clinica`, `current_clinica_id` e `get_my_clinica_id`. A multiunidade ainda não existe.
- Comandos: `npx tsc --noEmit -p tsconfig.app.json`, `npm run test:run`, `npm run lint`, `npm run check:colunas`, `check:falhas`, `check:permissoes`, `check:a11y`, `npm run build`.
- O Git usa `core.autocrlf=true`: normalize as quebras de linha antes de substituir texto por script.

## Limites (não negociáveis)
- Sem deploy, sem aplicar migration e sem mexer em produção, SSH ou VPS sem pedido explícito do responsável. Migrations são escritas só localmente.
- Commit e push só quando o responsável pedir.
- Nunca use dados reais de pacientes; use dados sintéticos. Nunca grave, imprima ou commite segredos ou valores de `.env`.
- Não gere conduta clínica. Lógica com impacto assistencial exige protocolo aprovado e revisão de profissional habilitado.
- ANS/TISS, ICP-Brasil, SBIS/CFM, LGPD e contratos: marque como "requer avaliação especializada"; não simule conformidade.
- Não altere o financeiro de pacientes (`pagamentos_mercadopago`, `lancamentos`) ao trabalhar na cobrança de planos.

## Recursos da máquina
- Vários agentes rodam ao mesmo tempo em um PC de 16 GB. Não rode `tsc` nem `vitest` completos: rode só os testes dos arquivos que você tocou (`npx vitest run <arquivo>`).
- Em cada rodada, a verificação é rápida: `tsc`, `npx vitest related --run <arquivos alterados>` e `eslint` nos arquivos alterados. A suíte completa só roda na rodada final, uma única vez.
- Seja objetivo: leia só os documentos que a tarefa pede e escreva resumos curtos.
- O orquestrador mantém no máximo cerca de 8 agentes abertos ao mesmo tempo.

## Padrão de evidência
- Toda conclusão cita `caminho:linha`, ou comando executado e resultado.
- Sem prova, marque `NÃO VERIFICADO`. Diferencie observação de hipótese.
- Diga "testado" só com comando executado e resultado real.
- Tela sem backend, mock silencioso ou botão falso conta como defeito, não como funcionalidade.

## Gravidade
- **P0:** vazamento entre clínicas; paciente, resultado ou prescrição errados; perda irreversível de dado clínico; falha grave de autenticação.
- **P1:** fluxo principal quebrado, cobrança errada, falha grave de usabilidade.
- **P2:** falha moderada com contorno seguro.
- **P3:** cosmético.

## Formato de item de backlog
`CLIN-QA-###`: gravidade, impacto (clínico/comercial), evidência, causa provável, proposta, esforço S/M/L, teste de aceite e dono.

Faixas de ID:

| Faixa | Área |
|---|---|
| 1xx | produto |
| 2xx | engenharia |
| 3xx | segurança, QA e SRE |
| 4xx | UX e go-to-market |
| 5xx | novos itens do time |

## Fluxo de trabalho
Veja `docs/time/TIME.md`. Cada agente entrega seu artefato no caminho indicado na própria definição e termina com um resumo curto: o que fez, evidência, riscos e próximo dono.
