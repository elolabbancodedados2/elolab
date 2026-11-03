# Módulo 2: Prontuário e consulta

Análise feita em 03/11/2026 sobre `origin/main`. A tela de atendimento foi avaliada pelo código, porque a clínica sintética não tem evoluções abertas.

## Situação atual

- **Tamanho:** cerca de 12 telas clínicas e 14,5 mil linhas.
  - `Prontuarios.tsx` tem 3747 linhas, 52 `useState` e 22 consultas diretas, e não tem teste de página.
  - Os outros arquivos grandes são `Prescricoes.tsx` (1770), `Triagem.tsx` (1388), `Atestados.tsx` (1323) e `Retornos.tsx` (1201).
- **O que já existe:**
  - salvamento automático a cada 30 s, Ctrl+S, Ctrl+Enter, Alt+1–9 e `/` para documentos;
  - copiar da última evolução, ditado, 7 modelos SOAP fixos e "Salvar e finalizar";
  - painel de segurança clínica e Memed;
  - assinatura com hash, registro imutável depois de assinado e adendos;
  - leitura auditada e resumo por IA.
- **Lacunas críticas:**
  - o catálogo de CID-10 está vazio (`Cid10Search.tsx:49-67`; as migrations `20260205172054` e `20260414150000` não fazem nenhum INSERT);
  - existem 3 motores de alerta de medicamento com coberturas diferentes;
  - os atalhos de documento descartam o texto que não foi salvo;
  - a IA envia o nome e a data de nascimento do paciente ao provedor.

## Escopo aprovado (03/11)

1. **Carregar o CID-10.**
   - Carga completa do CID-10 do DATASUS, com cerca de 14 mil subcategorias e categorias, código e descrição em português.
   - Escolher uma só tabela (`cid10` ou `cid10_codigos`), a que já é usada por `Cid10Search` e `prontuario_diagnosticos`.
   - A migration de dados é idempotente (`ON CONFLICT DO NOTHING`), com nome `20261103200000_cid10_carga_datasus.sql`, e usa um índice de busca (trigram ou `to_tsvector` com unaccent, se a extensão existir; senão `ILIKE` com índice em `lower`).
   - **Não aplicar.**
   - *Aceite:* a busca por "J06" e por "amigdalite" retorna resultados. Um teste lê a migration e exige mais de 10 mil linhas.
2. **Atalhos não perdem texto.** Receita, Exame, Atestado e Encaminhamento salvam o rascunho sem aviso antes de navegar, como já faz `handleScheduleReturn`. Se o salvamento falhar, a tela continua aberta e mostra um aviso. O diálogo "Descartar" só aparece em Cancelar.
   - Arquivos: `AtalhosDocumentos.tsx:26,46-56` e `Prontuarios.tsx:1077-1083,1932-1969,3676-3701`.
   - *Aceite:* um teste de componente cobre os 4 atalhos.
3. **Motor único de alertas.** Uma função cobre alergia, interação, idade/gestação e comorbidade, e é usada por `Prontuarios` e por `Prescricoes`.
   - Arquivos: `DrugInteractionChecker.tsx:31,59`, `clinicalAlerts.ts:456,478`, `Prescricoes.tsx:730-745`, `Prontuarios.tsx:1238-1252`.
   - Remover o código que ficar morto (`lib/drugInteractionChecker.ts` ou a lista local).
   - *Aceite:* testes provam que varfarina + AAS e gestante + isotretinoína alertam nos dois fluxos, e que a justificativa de override é gravada nos dois.
4. **Sugerir assinatura ao finalizar.** "Salvar e finalizar" abre a etapa de assinatura, que o médico pode pular. Rascunhos com mais de 24 h ficam destacados em âmbar na lista e no contador.
   - Arquivos: `Prontuarios.tsx:1971-1992,3630-3640,2479`.
   - Não tornar a assinatura obrigatória.
5. **Receita tipada no prontuário.** Um Select na aba Prescrição oferece simples, controle especial e antimicrobiano. Todos os tipos usam um só gerador de PDF, o mesmo de Prescrições: o controle especial sai em 2 vias e com o endereço do paciente.
   - Arquivos: `Prontuarios.tsx:2445-2451`, `pdfGenerator.ts:249`, `Prescricoes.tsx:140-170`.
   - *Aceite:* um teste do texto gerado para os 3 tipos.
6. **Ajustes pequenos:**
   - **Pedido de exame:** uma só entrada, que leva o agendamento e `voltar=prontuario` (`AtalhosDocumentos.tsx:49`, `Prontuarios.tsx:2187-2200,3662`).
   - **"Atender próximo":** ao concluir em `FinalizarAtendimento.tsx:274-278`, chamar o próximo paciente da fila do médico.
   - **Resumo por IA:** passa para o topo do atendimento. A edge function `patient-clinical-summary` não envia mais nome nem data de nascimento, só idade e sexo (`index.ts:76,113-125`; `PatientTimeline.tsx:432-445`).
   - **Celular:** em Documentos clínicos, a lista aparece antes dos 5 KPIs. Em Prontuários, o estado vazio não pode ficar atrás da barra inferior.
   - **Vocabulário:** "modelo" no lugar de "template" nos textos da interface. Rótulos de aba para `/prescricoes`, `/templates*` e `/tipos-consulta` em `routeLabels.ts`.
   - **Duplicações:** um só `calcularIMC`, um só `calcularIdade` e campos de sinais vitais compartilhados entre prontuário e triagem (`Prontuarios.tsx:161-275`, `Triagem.tsx:142`, `pdfGenerator.ts:1288`, `DischargeReport.tsx:60`).

## Fora deste lote

- base de medicamentos CMED;
- assinatura ICP-Brasil em nuvem;
- modelos de evolução por especialidade e textos rápidos;
- lista de problemas ativos;
- versões de rascunho e regra de exclusão (exigem aprovação legal);
- documentos no portal;
- curvas da OMS;
- painel lateral de documentos;
- divisão de `Prontuarios.tsx`.
