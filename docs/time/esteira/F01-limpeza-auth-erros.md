# F01: limpeza, eventos de cadastro e HINT de MFA

## O que foi feito
1. **MobileBottomNav removido.** `grep -rn MobileBottomNav src tests` só encontrou o próprio teste. Removidos `src/components/layout/MobileBottomNav.tsx` e `src/components/layout/__tests__/MobileBottomNav.test.tsx` (os dois estavam fora do Git). Depois da remoção, a mesma busca não retorna nada.
2. **Eventos de cadastro em `src/pages/Auth.tsx`** (pendência 1 do E10):
   - `signup_started` uma vez por montagem quando a URL tem `cadastro=1`, com `plan_slug` e `mode` só quando a intenção de plano é válida, mais `capturarUtm()`. Um `useRef` evita disparo duplo no StrictMode.
   - `signup_submitted` depois de um `signUp` sem erro e com `user.id`, só no cadastro sem convite.
   - `anexarUtm(activationRedirect.searchParams)` repassa `utm_*`/`seg` ao link de ativação do e-mail (sem convite).
   - Sem consentimento ou sem provedor registrado, `track` não envia nada (`src/lib/analytics.ts`).
3. **HINT `mfa_necessario` em `src/lib/erros.ts`**: quando o erro chega com esse HINT, verificado antes do `switch` de códigos, a mensagem passa a ser "Esta ação exige a verificação em duas etapas. Confirme o código do aplicativo autenticador e tente novamente." Antes, o erro caía no 42501 genérico ("não tem permissão"). Há um teste novo em `src/lib/__tests__/erros.test.ts`.

## Verificação (comandos reais)
- `npx tsc --noEmit -p tsconfig.app.json`: 0 erros.
- `npx vitest related --run src/pages/Auth.tsx src/lib/erros.ts src/lib/__tests__/erros.test.ts`: 73 arquivos e 370 testes aprovados.
- `npx eslint` nos 3 arquivos tocados: código de saída 0. Os 5 avisos de `Auth.tsx` (4 `no-explicit-any` e 1 `react-refresh`) já existiam; esta tarefa não acrescentou `any`.

## Riscos e pendências
- `Auth.tsx` não tem teste de tela. Os eventos foram verificados só por tipo e revisão, não por teste: NÃO VERIFICADO em execução. Dono: qa-engineer.
- A escolha de provedor, o DPA e a base legal continuam com o responsável (pendência 3 do E10).

ESTEIRA: CONCLUIDO
