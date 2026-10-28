# CLIN-QA-521: API exige AAL2 de qualquer usuário com fator cadastrado

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-007 (304) |
| Gravidade | P1 |
| Impacto | Segurança. Quem cadastrou o segundo fator conta com ele, mas o token só de senha ainda acessa a API |
| Perfil | Qualquer usuário de clínica com TOTP (médico, recepção, financeiro, laboratório, administrador) |
| Esforço | M |
| Dono sugerido | `database-engineer` + `security-engineer` |
| Dependências | CLIN-QA-520 (mesmo mecanismo, escopo menor primeiro) |
| Status | Aberto (27/10, após a rodada 2) |

## Critérios de aceite
- **CA1 (caminho principal).** Dado um médico com TOTP que entrou com senha e código, quando abre prontuários, então tudo funciona.
- **CA2 (permissão negada).** Dado o mesmo médico com token AAL1, quando chama a API direto em `prontuarios` ou `pacientes`, então recebe erro de permissão.
- **CA3 (sem fator).** Dado um usuário sem fator cadastrado, quando usa o sistema, então nada muda.
- **CA4 (outra clínica).** Dado um usuário da clínica A com AAL2, quando tenta acessar dados da clínica B, então continua negado pela RLS de tenant (o AAL2 não amplia acesso).
- **CA5 (remoção do fator).** Dado um usuário que remove o fator, quando faz a próxima requisição, então o comportamento segue a regra de "sem fator", e a remoção fica registrada em auditoria.
- **CA6 (erro traduzido).** A mensagem pede a confirmação do segundo fator, sem texto técnico.

## Definição de pronto
DoD comum, mais: casos CA2 a CA4 na suíte com banco local (CLIN-QA-510).

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem correção escrita (mesmo grep da 520).

### O que falta
- Depende da 520.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
