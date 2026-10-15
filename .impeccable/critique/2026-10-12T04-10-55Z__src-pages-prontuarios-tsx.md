---
target: fluxo do prontuário
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\lopes\\orca\\elolab\\src\\pages\\Prontuarios.tsx"
target_fingerprint: "sha256:a3b2590805badc4946f4fc05ac24a5b0c5275ca660028e3ca277ff8eb0f2acb1"
target_path: "C:\\Users\\lopes\\orca\\elolab\\src\\pages\\Prontuarios.tsx"
timestamp: 2026-10-12T04-10-55Z
slug: src-pages-prontuarios-tsx
---
# Revisão de UX do prontuário

## Design Health Score

| # | Heurística | Nota | Evidência principal |
|---|---|---:|---|
| 1 | Visibilidade do estado do sistema | 3/4 | Salvamento automático e rascunhos comunicados; estados visuais precisam de validação na interface renderizada. |
| 2 | Correspondência com o mundo real | 3/4 | Etapas clínicas SOAP e organização reconhecível para atendimento. |
| 3 | Controle e liberdade | 3/4 | Aviso ao sair, descarte confirmado, retomada e detecção de edição concorrente. |
| 4 | Consistência e padrões | 2/4 | Oito/nove abas e padrões de texto muito pequenos aumentam variação e densidade. |
| 5 | Prevenção de erros | 3/4 | Proteção de rascunho e bloqueio do registro assinado; faltam rótulos explícitos em campos. |
| 6 | Reconhecimento em vez de memorização | 2/4 | Seleção de paciente e campos apoiam reconhecimento, mas placeholders não persistem como orientação. |
| 7 | Flexibilidade e eficiência | 2/4 | Navegação longa por muitas abas; não foi validado um caminho rápido em celular. |
| 8 | Design minimalista | 2/4 | Campos e metadados densos, com textos de 9–11 px. |
| 9 | Recuperação de erros | 3/4 | Rascunhos, confirmação e aviso de conflito protegem o trabalho; feedback visual não pôde ser verificado. |
| 10 | Ajuda e documentação | 1/4 | Não foi identificada ajuda contextual evidente no fluxo analisado. |
| **Total** |  | **24/40** | **Aceitável, com melhorias significativas recomendadas.** |

## Veredito de especificidade

**Avaliação de design:** o fluxo é específico para o trabalho clínico, com etapas SOAP, autoria médica, alertas de segurança, rascunhos retomáveis e proteção de registros assinados. Não parece um formulário genérico. A melhoria mais importante é reduzir esforço de navegação e leitura sem remover recursos clínicos.

**Detector:** `impeccable detect --json src/pages/Prontuarios.tsx` não encontrou achados (0 regras). Isso não contradiz os problemas de rótulos e densidade: a inspeção do código encontrou questões que o detector não reporta. Não há falsos positivos para classificar.

**Evidência visual:** a rota local abriu, mas ficou em “Preparando seu espaço de cuidado” tanto no desktop como em viewport móvel de 390×844. A execução local não tinha a configuração necessária do Supabase; não há captura representativa nem overlay confiável. As observações de layout são inferências do código.

## Impressão geral

Há uma base clínica sólida e boas proteções contra perda de trabalho e alteração inadvertida. A tela ainda pede demais de quem lê e navega: há muitos caminhos no mesmo nível, texto pequeno e campos cuja identificação depende do placeholder. Antes de declarar todas as telas prontas, é preciso corrigir esses pontos e validar o fluxo visual com a aplicação carregada.

## O que funciona

- Rascunhos mostram paciente, queixa e última alteração, ajudando a equipe a retomar o atendimento.
- Salvamento periódico, aviso ao sair, confirmação ao descartar e detecção de edição concorrente protegem o trabalho em andamento.
- Anamnese, exame, diagnóstico, conduta e prescrição seguem uma ordem clínica familiar; prontuário assinado fica bloqueado.

## Problemas prioritários

1. **[P1] Campos sem rótulos explícitos.** Busca de pacientes, sinais vitais e diversos campos clínicos usam placeholders como orientação principal; campos de pressão não têm rótulo individual. Isso prejudica leitores de tela e torna campos preenchidos mais difíceis de identificar. Associe `Label`/`htmlFor` ou nomes acessíveis explícitos a cada controle. Referências: `src/pages/Prontuarios.tsx` linhas 1645, 198 e 2185. Sugestão: `$impeccable audit`.
2. **[P1] Muitas abas em um único nível.** São oito abas principais e nove para administradores; em celulares a navegação rola horizontalmente e opções podem ficar escondidas. Agrupe as etapas, torne evidente a existência de abas laterais e valide teclado e toque em viewport estreita. Referência: linha 2137. Sugestão: `$impeccable adapt`.
3. **[P2] Tipografia pequena para leitura clínica.** Há textos e controles em 9–11 px, inclusive em informações do paciente, auditoria e prescrição. Isso aumenta esforço e dificulta baixa visão ou zoom. Eleve o tamanho base e reserve microtexto a metadados secundários. Referências: linhas 535, 2057 e 2354. Sugestão: `$impeccable typeset`.
4. **[P2] Seleção de paciente alonga o caminho no celular.** A lista antecede o conteúdo do prontuário e usa uma altura baseada na viewport; em telas estreitas o usuário pode rolar bastante antes de chegar às evoluções. Compacte a seleção e ofereça acesso claro ao conteúdo escolhido. Referências: linhas 1637 e 1654. Sugestão: `$impeccable adapt`.

## Alertas por perfil

- **Profissional experiente:** oito/nove abas podem tornar o acesso repetido a evolução e prescrição mais lento; não foi observado um atalho de navegação rápida.
- **Pessoa que usa leitor de tela ou teclado:** campos identificados só por placeholder e pressão sistólica/diastólica sem rótulos associados são barreiras; a execução com leitor de tela não foi feita.
- **Pessoa em celular:** a lista de pacientes antes do prontuário e a navegação horizontal por abas podem exigir rolagem longa e esconder opções.

## Observações menores

- A revisão cobriu seleção e busca de pacientes, rascunhos, ficha, histórico, solicitações, timeline, sinais vitais, exportação, anexos e editor de atendimento.
- Não houve teste manual da aplicação carregada nem validação com leitor de tela; a avaliação de responsividade decorre do código.

## Perguntas para orientar melhorias

- Você quer priorizar primeiro **acessibilidade dos campos** ou **navegação em celular**?
- Para as abas, prefere **agrupar etapas clínicas** ou **manter todas visíveis com um indicador mais claro de rolagem**?
