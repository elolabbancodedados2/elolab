# Revisão de segurança: funções públicas

**Escopo:** análise estática de `public-booking`, `patient-portal` e `whatsapp-webhook` na base nova, incluindo helpers diretamente usados para autenticação e rate limit. Nenhuma chamada a banco real ou ambiente publicado foi feita. Linhas referem-se ao estado lido em 27/10/2026.

## Achados

### CLIN-QA-316 — P2: uma credencial de webhook pode forjar eventos para qualquer instância

- **Evidência:** `supabase/functions/whatsapp-webhook/index.ts:37-38,55-60,70-85,91-103`. A função compara a credencial recebida com uma única `EVOLUTION_API_KEY`, lê `body.instance` e usa esse nome para localizar a sessão. A checagem de clínica valida a relação sessão/agente, mas não associa a credencial autenticadora a uma instância específica.
- **Cenário:** se a chave compartilhada for exposta a um operador/integração de uma instância, essa parte pode enviar eventos autenticados usando o nome de outra instância; o webhook processará estado, QR ou mensagens sob a clínica da sessão indicada. A chave não é registrada nos logs pelo código revisado.
- **Correção proposta:** emitir segredo distinto por instância, vinculá-lo à sessão no servidor e validar a sessão autenticada antes de aceitar eventos. Guardar somente hash quando viável e prever rotação. Validar a configuração real da Evolution antes de fechar o achado como explorável no ambiente.
- **Esforço:** M. **Aceite:** uma credencial da instância A não consegue atualizar nem inserir dados da sessão da instância B.
- **Dono:** Backend + responsável pela integração.

### CLIN-QA-320 — P2: dados de contato são duplicados em observações do agendamento

- **Evidência:** `supabase/functions/public-booking/index.ts:295-303` grava nome e telefone, e opcionalmente e-mail, em `agendamentos.observacoes` mesmo após vincular o agendamento ao paciente (`paciente_id`). O fluxo de pendência alterado por E01 guarda um conjunto menor em uma tarefa, mas o fluxo normal ainda replica esses dados em texto livre.
- **Cenário:** qualquer pessoa com acesso às observações de agendamento recebe esses dados de contato junto do registro clínico, mesmo que não precise consultar os campos de contato do paciente. A cópia também continua existindo se os dados do cadastro forem atualizados.
- **Correção proposta:** manter nas observações apenas o marcador e a instrução operacional; consultar contato no cadastro do paciente quando necessário. Se a confirmação exigir cópia, definir prazo e acesso restrito para removê-la depois.
- **Esforço:** S. **Aceite:** novo agendamento online não copia nome, telefone ou e-mail para observações.
- **Dono:** Backend + Segurança/Produto.

## Riscos não confirmados

- **Rate limit e IP de origem — NÃO VERIFICADO no ambiente:** `public-booking` e `patient-portal` usam `clientIp(req)` para as cotas (`public-booking/index.ts:99-102`; `patient-portal/index.ts:55-60`). O helper aceita `x-real-ip` ou o primeiro `x-forwarded-for` (`supabase/functions/_shared/rateLimit.ts:59-64`). Se o gateway não substituir/limpar esses headers, o cliente pode variar o IP declarado e contornar a cota. Não inspecionei Kong/Traefik nem validei comportamento do proxy. **Ação:** responsável deve confirmar a política de headers no gateway e testar a origem recebida pela Edge Function; se não houver garantia, usar header confiável emitido pelo proxy.
- **Estado do banco e grants — NÃO VERIFICADO:** esta revisão não consultou grants, RLS, índices/constraints ou drift no banco real. O vínculo cross-clinic via código do portal está escopado explicitamente por `clinica_id` nas operações revisadas; isso não confirma o estado efetivo do banco.

## Controles observados

- `public-booking` limita requisições, falha fechado quando o rate limit falha, valida UUID/data/horário/CPF e usa hash de token de hold (`public-booking/index.ts:95-104,164-190,217-235`). O caminho público de conflito de CPF/nascimento responde de forma uniforme e o fluxo E01 não copia CPF/data de nascimento à tarefa; conferir `public-booking/index.ts:238-256` e `supabase/functions/public-booking/pendencia.ts:20-38`.
- `patient-portal` valida token hexadecimal de 64 caracteres e compara seu SHA-256 com token ativo e não expirado (`patient-portal/acessoPortal.ts:15-16,35-65`). Consultas sensíveis usam paciente e clínica; exemplos em `patient-portal/index.ts:174-178,184-192,323-353,358-380`. Links de arquivo são assinados por 300 segundos após conferir o caminho contra paciente/clínica.
- O portal não permite dependente apenas por CPF do responsável: `patient-portal/index.ts:105-137` exige resolução explícita; as atualizações de contato são do titular (`:138-145`).
- O webhook não registra o corpo das mensagens nos logs (`whatsapp-webhook/index.ts:76-78`); mensagens processadas são persistidas no banco para funcionamento do produto (`:218-232`). A deduplicação por ID e clínica está em `:169-180,234-238`.

## Limites da revisão

Análise estática apenas; não rodei testes, não acessei produção e não verifiquei configurações de proxy ou da Evolution API. Não identifiquei P0 ou P1 confirmado neste escopo. Requer avaliação especializada: retenção e base legal para dados pessoais e mensagens armazenados no produto.
