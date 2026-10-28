# E04 — revisão independente das funções públicas

## O que fiz

Revisei estaticamente `public-booking`, `patient-portal` e `whatsapp-webhook`, incluindo helpers de token e rate limit. Registrei dois achados P2 (chave webhook compartilhada entre instâncias; dados de contato duplicados em observações) e um risco de rate limit dependente da configuração do proxy, marcado **NÃO VERIFICADO**. Não encontrei P0/P1 confirmado no escopo.

## Arquivos

- `docs/seguranca/auditoria-funcoes-publicas.md` — evidências, cenários, correções e pendências.
- `docs/time/esteira/E04-sec-funcoes-publicas.md` — este resumo.

## Comandos e resultados

- Leitura estática com `rg`, leitura dos trechos dos três arquivos e helpers, e `git diff` para acompanhar alterações concorrentes; sem testes ou chamadas ao banco.
- Não rodei `tsc`, Vitest ou ESLint: nenhum código foi alterado nesta tarefa.

## Pendências

- Responsável pela integração: confirmar se a Evolution usa de fato a mesma `EVOLUTION_API_KEY` em todas as instâncias e planejar credenciais por instância.
- Responsável/SRE: confirmar que Kong/Traefik sobrescreve `x-real-ip` e `x-forwarded-for` antes da Edge Function.
- Próximo dono: Backend para correções; Segurança/Responsável para validar configurações reais e riscos de retenção.
