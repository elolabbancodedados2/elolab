# CLIN-QA-529: TISS, especificação da versão vigente e do escopo do primeiro lote

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-010 (110, 208) |
| Gravidade | P1 (comercial) |
| Impacto | Comercial. Sem TISS XML, clínicas com convênio e laboratórios não compram |
| Perfil | Faturista da clínica; financeiro |
| Esforço | S |
| Dono sugerido | `especialista-dominio-saude` + `business-analyst`; PO Faturamento valida |
| Dependências | `docs/produto/dominio/requisitos-regulatorios.md` e `docs/produto/processos/` (rodada 1). **Requer avaliação especializada** (ANS) |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Evidência
- `src/pages/FaturamentoConvenios.tsx:335` (conferido nesta rodada): o XML gerado diz "Resumo operacional EloLab; não é arquivo TISS de transmissão."

## Critérios de aceite
- **CA1 (versão).** Dada a pesquisa, quando concluída, então registra a versão TISS vigente, a data da consulta e o link oficial da ANS.
- **CA2 (escopo).** Dados os tipos de guia, quando priorizados, então o primeiro lote cobre as guias de consulta e de SP/SADT, com os campos obrigatórios mapeados para colunas existentes ou faltantes (`caminho:linha`).
- **CA3 (outra clínica).** A especificação define que o lote, o número sequencial e o registro ANS da operadora são por clínica, e nenhum lote mistura guias de clínicas diferentes.
- **CA4 (permissão).** A especificação define quem gera, quem confere e quem transmite o lote (perfis financeiro e administrador), e que o médico e a recepção não geram.
- **CA5 (erro).** A especificação lista as validações que impedem gerar o lote (campo faltante, versão divergente) e as mensagens ao usuário.
- **CA6 (honestidade).** O texto não afirma conformidade; marca "requer avaliação especializada".

## Definição de pronto
Documento revisado pelo PO; lacunas de dados viram histórias; nenhuma promessa comercial até a CLIN-QA-530 ser aceita.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- O especialista de domínio escreveu `docs/produto/dominio/requisitos-regulatorios.md` (rodada 1): a versão vigente de Comunicação TISS é 04.03.00, e o sistema só lista até 04.01.00 (item 593); não existe guia de faturamento (594).

### O que falta
- Avaliação especializada ANS **[requer avaliação especializada]** e decisão de escopo do primeiro lote.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
