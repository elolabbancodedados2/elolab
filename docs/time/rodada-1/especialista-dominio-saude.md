# Rodada 1: especialista-dominio-saude

Data: 27/10/2026.

## O que fiz
Escrevi `docs/produto/dominio/requisitos-regulatorios.md`, que cobre TISS (versão vigente, guias, lote, XML e XSD), assinatura eletrônica e ICP-Brasil para prescrição e atestado, laboratório (RDC 978/2025: rastreio de amostra, validação, liberação, retificação, valor crítico e CQ), odontograma e prontuário odontológico (CFO) e prontuário (Lei 13.787/2018 e CFM). Cada tema traz a regra, a fonte pública datada, a situação no sistema com `caminho:linha`, a lacuna e uma recomendação. Todos os temas estão marcados como "requer avaliação especializada". O documento não declara conformidade.

## Arquivos tocados
- `docs/produto/dominio/requisitos-regulatorios.md` (novo)
- `docs/time/rodada-1/especialista-dominio-saude.md` (novo)

Não alterei nenhum código.

## Evidências
- Leitura estática com Grep e Read nos arquivos citados no documento. Os principais:
  - `src/pages/Convenios.tsx:32`
  - `src/pages/FaturamentoConvenios.tsx:333-337`
  - `supabase/migrations/20260818040000_lotes_tiss_e_glosas.sql:8,26,30`
  - `src/pages/Prescricoes.tsx:593,1100`
  - `src/pages/Atestados.tsx:788`
  - `supabase/migrations/20261011180000_integridade_tenant_laboratorio.sql:262,375,386-387,402`
  - `supabase/migrations/20260131002504_…sql:6,127-137`
  - `src/pages/MapaColeta.tsx:53,346-351`
  - `supabase/migrations/20260818030000_assinatura_prontuario_verificavel.sql:105-109`
- Fontes web consultadas em 27/10/2026: página TISS de julho/2026 da ANS, Lei 14.063/2020 (Planalto), Lei 13.787/2018 (Câmara), página da RDC 1.000 no CFM, RDC 978/2025 (compilação da LegisWeb) e notícias sobre o Atesta CFM. As URLs estão no documento.
- Não executei testes nem a aplicação. Isso não era necessário para um entregável só de documentação.

## Achados principais (novos IDs 501–509)
- **501 (P1, regulatório):** a receita local sai sempre como "simples", sem aviso para controle especial ou antimicrobiano. A exigência de SNCR da RDC 1.000/2025 começa por volta de 30/10/2026, mas a data exata diverge entre as fontes.
- **502 (P2):** as telas dizem que o gov.br é ICP-Brasil. A assinatura gov.br é avançada, e a Lei 14.063, art. 13, exige assinatura qualificada para atestado eletrônico e receita controlada. A correção de texto é de esforço S.
- **503 (P2):** a lista de versões TISS está desatualizada (vai só até 04.01.00; a versão vigente de Comunicação é 04.03.00).
- **504 (P1 comercial):** não existe guia de faturamento, e o lote recebe a quantidade de guias digitada. Esse modelo é pré-requisito do CLIN-QA-010.
- **505 (P1):** a retificação de um laudo já liberado é republicada sem nova conferência, e o perfil `enfermagem` conta como "responsável técnico". Não há papéis de laboratório.
- **506 a 508 (P2):** valor crítico sem registro de comunicação; CQ desligado da liberação; etiqueta sem o número de registro do paciente (RDC 978, art. 138).
- **509 (P3):** "CRM" fixo nos documentos e na assinatura, embora o cadastro aceite CRO.

## Riscos
- Os textos integrais da RDC 978, da RDC 1.000 e 1.028, da Res. CFM 2.299 e da Res. CFO 91/2009 não foram lidos. Usei fontes secundárias, indicadas no documento.
- O prazo do SNCR é iminente e diverge entre as fontes. Antes de qualquer comunicação a clientes, é preciso confirmar no comunicado oficial da Anvisa.
- As datas da seção XII do TISS 202607 e a presença dos XSD nos pacotes ficaram NÃO VERIFICADAS.

## Próximo dono
- PO Clínico e UX: 501 e 502 (esforço S, e há prazo).
- PO Lab e Backend: 505, 506, 507 e 508, junto com o 022.
- PO Faturamento e Arquiteto: 503 e 504, antes do 010.
- `clinical-quality-director`: consolidar no `CONSOLIDADO.md`.
- Avaliação especializada (jurídica, regulatória e responsável técnico de laboratório) antes de fechar os requisitos.
