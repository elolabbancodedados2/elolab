# F02 aal-funcoes (backend-developer)

## O que foi feito
Exigência de MFA (AAL2) do E06 aplicada às edge functions que escrevem com `service_role` e por isso não passam pelos triggers da migration `20261029110000`.

- **Helper novo:** `supabase/functions/_shared/aal.ts`, com a mesma regra de `public.mfa_satisfeito()`:
  - sessão `aal2`: permitido;
  - conta com fator verificado em AAL1: negado (`fator_em_aal1`);
  - `politica_mfa` ligada e perfil sensível (plataforma, `admin` ou `financeiro`) sem fator: negado (`cadastro_obrigatorio`);
  - nos demais casos, permitido.
  - Tabela `politica_mfa` ausente (migration não aplicada, `42P01`/`PGRST205`) equivale à política desligada. Qualquer outra falha ao consultar fator, política ou perfil nega (`falha_verificacao`, fail closed).
  - Resposta: `403` com `code: "mfa_necessario"` (igual ao HINT do banco) e mensagem formal; falha de verificação vira `503` com `code: "mfa_indisponivel"`.
  - O claim `aal` é lido do bearer só depois de `auth.getUser` validar o token. Fatores vêm de `user.factors`, com `auth.admin.mfa.listFactors` como alternativa.
- **`invite-employee/index.ts`:** a checagem roda logo após confirmar o papel `admin`, antes de criar o convite. Admin é tratado como perfil sensível.
- **`admin-contas/index.ts`:** a checagem roda logo após confirmar `platform_admins`, valendo também para a `previa`, como `is_platform_admin()` no banco. A recusa é registrada em `admin_acoes` (`erro: "mfa: <motivo>"`).
- **`accept-invite/index.ts`:** a checagem vale só na ação `accept_authenticated`, depois das checagens de e-mail, convite já aceito e expiração e antes de gravar perfil e papéis. O perfil sensível é o perfil **atual** da conta (`perfilExigeMfa`), consultado apenas com a política ligada.
  - A ação `accept` (conta nova criada com senha) não tem sessão nem fator, então não há o que checar.
- O helper antigo `_shared/authMfa.ts` (usado por `memed-prescription` e `whatsapp-evolution`) não foi alterado.

## Comandos e resultados
- `npx -y deno@2 test --allow-env --allow-read supabase/functions/_shared/aal.deno.test.ts`: **12 passed, 0 failed**. Os testes cobrem a leitura do claim, a tabela de decisão, AAL2 sem consulta, política ausente, fail closed, `listFactors`, `perfilExigeMfa` e o formato da resposta.
- `npx -y deno@2 check` em `_shared/aal.ts`, `accept-invite`, `invite-employee`, `admin-contas` e `memed-prescription`: sem erros.
- `npx -y deno@2 lint` em `aal.ts` e `aal.deno.test.ts`: `Checked 2 files`, sem problemas.
- `npx eslint` nos 5 arquivos: 0 erros. Nos dois arquivos novos, 0 avisos. Os 3 `index.ts` têm avisos `no-explicit-any` antigos, fora das linhas alteradas.
- `npx tsc --noEmit -p tsconfig.app.json`: exit 0. As funções Deno ficam fora desse projeto; a checagem delas é o `deno check`.
- `vitest related` não se aplica: o Vitest inclui só `src/**`.

## Decisões e riscos
- **`accept-invite` com a política ligada:** um convite que **dá** `admin` ou `financeiro` a uma conta sem fator não é bloqueado no aceite. Bloquear impediria o aceite, porque a tela de convite não oferece o cadastro do fator. O login (`MFAObrigatorio` + `Auth.tsx`) obriga o cadastro em seguida, e os triggers negam as operações sensíveis até lá. Quem decide se o aceite deve exigir o fator antes é o responsável e o `security-engineer`.
- **Frontend:** as telas que chamam essas funções não tratam ainda `code: "mfa_necessario"` (oferecer o TOTP e repetir a chamada). Fica com o `frontend-developer`. `NÃO VERIFICADO` em tela.
- `NÃO VERIFICADO` contra o GoTrue real: a presença de `factors` no `getUser` da versão self-hosted e o claim `aal` nos tokens emitidos. Falta teste de integração.
- Nada foi publicado nem commitado. As funções só entram em vigor quando forem publicadas, idealmente junto com a migration `20261029110000`.

Próximo dono: `security-engineer` (revisão) e `frontend-developer` (tratar o código `mfa_necessario` nas telas de convite e de contas).

ESTEIRA: CONCLUIDO
