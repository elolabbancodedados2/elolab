# CLIN-QA-518: Staging com dados sintéticos e as mesmas migrations da produção

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-006 (309, SRE 4) |
| Gravidade | P1 (gate). Pré-requisito do smoke das 13 jornadas (30.9) e do teste com usuários (60.2) |
| Impacto | Operação e produto. Hoje não há onde validar sem tocar produção |
| Perfil | QA, UX Research, Sales (demo) |
| Esforço | M |
| Dono sugerido | `devops-sre`; seed por `qa-engineer` |
| Dependências | CLIN-QA-516 |
| Status | Aberto (27/10, após a rodada 2) |

## Critérios de aceite
- **CA1 (caminho principal).** Dado o staging, quando recebe o deploy, então tem exatamente as migrations da produção (`migration list` igual).
- **CA2 (dados sintéticos).** Dado o seed, quando carregado, então cria duas clínicas, os perfis recepção, médico, financeiro, laboratório e administrador em cada uma, e pacientes fictícios. Nenhum dado real.
- **CA3 (outra clínica).** Dado um usuário da clínica A no staging, quando navega por agenda, prontuário e caixa, então não vê nada da clínica B.
- **CA4 (permissão negada).** Dado um usuário sem acesso ao staging, ou a credencial de staging usada contra a produção, quando tenta entrar, então é negado; as chaves de staging e produção são distintas.
- **CA5 (isolamento de integrações).** Dado o staging, quando agenda ou cobra, então nenhuma mensagem real de WhatsApp, e-mail ou cobrança do Mercado Pago é enviada (integrações em sandbox ou desligadas).
- **CA6 (erro).** Dado um reset do staging, quando roda, então volta ao seed sem passo manual.

## Definição de pronto
DoD comum, mais: URL e procedimento de reset documentados em `docs/operations/`, sem segredos.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho. É pré-requisito da pesquisa de usabilidade e do smoke S5.

### O que falta
- Decisão do responsável sobre onde hospedar a homologação.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
