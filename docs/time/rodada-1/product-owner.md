# Rodada 1: product-owner

Data: 27/10/2026. Só documentação. Sem código de produto, migration, deploy, commit ou acesso à VPS.

## O que fiz
- Quebrei os 14 itens P0 e P1 do diagnóstico (`docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, D.3, CLIN-QA-001 a 014) em **34 histórias** (CLIN-QA-501 a 534), uma por arquivo. Os 14 itens viraram épicos.
- Cada história traz gravidade, impacto, perfil, evidência (`caminho:linha`), proposta, esforço, critérios Dado/Quando/Então (caminho principal, erro, permissão negada e outra clínica), definição de pronto, dependências e dono sugerido.
- Escrevi `docs/produto/backlog/README.md` com a fila ordenada (P0 primeiro, depois a fase do roadmap F.1 a F.5), a rastreabilidade épico → histórias, o gate de saída da estabilização e a definição de pronto comum.
- Faixa de IDs: usei 5xx ("novos itens do time") e reservei **501–549 para o PO** no README, para evitar colisão com outros agentes.
- Em duas histórias, os critérios de outra clínica e permissão aparecem como "não se aplica", com justificativa: 515 (texto da landing pública) e 528 (gate de build).

## Arquivos tocados (todos novos)
- `docs/produto/backlog/README.md`
- `docs/produto/backlog/CLIN-QA-501-…md` a `CLIN-QA-534-…md` (34 arquivos)
- `docs/time/rodada-1/product-owner.md`

Incidente: criei por engano `C:\Users\lopes\orca\workspces\…\backlog\README.md` (erro de digitação no caminho, fora do repositório). Removi o arquivo e as pastas vazias; `ls /c/Users/lopes/orca/workspces` confirma que a pasta não existe mais.

## Evidências (comandos executados nesta rodada)
- `sed -n` nos trechos citados, com estes resultados:
  - `src/pages/LandingPage.tsx:209` ainda promete "rastreabilidade de amostras por código de barras";
  - `src/pages/MapaColeta.tsx:346-347` imprime o código em texto;
  - `src/pages/Auth.tsx:149-158` decide o AAL só no cliente;
  - `.github/workflows/test.yml:68-70` faz `supabase link` com projeto Cloud;
  - `scripts/test-supabase-env.ts:41-44` devolve `null` sem `QA_*`;
  - `tests/isolamento-entre-clinicas.spec.ts:114` usa `.filter(Boolean)`;
  - `src/pages/Prontuarios.tsx:2069-2080` mostra o nome em `text-[10px]` e o CPF sem máscara;
  - `src/pages/FaturamentoConvenios.tsx:335` declara "não é arquivo TISS";
  - `src/components/clinical/DigitalSignature.tsx:29-41` declara que nenhuma assinatura ICP acontece;
  - `supabase/functions/whatsapp-webhook/index.ts:40-46` compara uma chave global com `!==`, e `:410` chama a OpenAI dentro do request.
- `ls supabase/migrations | wc -l` = 454; `ls supabase/migrations | cut -c1-14 | sort | uniq -d` = `20261010198000`.
- Contenção em andamento, no código local, não validada por mim:
  - `supabase/functions/public-booking/index.ts:190-191` e `whatsapp-webhook/index.ts:177-180` (vínculo por telefone removido);
  - `src/lib/lgpdCompliance.ts:136` (`EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA = false`).
- Achados novos do PO:
  - **Portal:** `supabase/functions/patient-portal/index.ts:940-952` lista dependentes por `cpf_responsavel`, sem confirmação. Hipótese de acesso indevido, NÃO VERIFICADO (história 512).
  - **Cache:** `src/contexts/SupabaseAuthContext.tsx:78-86` já limpa o cache ao trocar de clínica. O risco do 014 é menor do que o relatado, mas falta prova por teste (história 527).
- Checagem dos arquivos do backlog:
  - um script conferiu que todos os 34 têm critério de outra clínica, de permissão, a definição de pronto e Dado/Dada;
  - todos os links do README apontam para arquivos existentes;
  - o grep por `Ã` só achou "NÃO", sem mojibake.
- Não rodei `tsc`, testes nem lint: nenhuma história foi entregue para validação nesta rodada.

## Riscos
- Status "Em andamento" vem dos planos da rodada (`docs/time/planos/ESTAB-7D-itens-3-4.md` e `TAREFAS.json`), não de entrega validada. **Nenhuma história está Aceita.**
- A 507 (conversas do WhatsApp abertas com vínculo antigo) mantém o paciente errado possível depois da publicação da 505. Ela depende de uma decisão do responsável.
- A 513 (anonimização) e as de TISS e ICP dependem de avaliação especializada. Sem parecer, não podem ser aceitas.
- A 524, a 525 e a 515 tocam arquivos com alterações locais de outra frente (`Prontuarios.tsx`, `Recepcao.tsx`, `CaixaDiario.tsx`, `LandingPage.tsx`). A integração precisa esperar o commit dessa frente.
- Os IDs 5xx podem colidir se outro agente criar itens 5xx sem consultar a reserva do README.

## Próximo dono
- `tech-lead`: confirmar a ordem e os donos da fila. Pedir validação ao PO de 504, 505, 506 e 508 quando a contenção ESTAB-7D tiver testes executados.
- `security-engineer` e o responsável: 501, que destrava 502 e 503.
- `qa-engineer` e `devops-sre`: 510, que é o gate de toda a estabilização.
- `clinical-quality-director`: usar a fila e o gate do README na consolidação da rodada.
