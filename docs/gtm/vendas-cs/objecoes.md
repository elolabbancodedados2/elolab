# Objeções comuns e respostas honestas

Data: 27/10/2026. Autor: `sales-customer-success`.

Princípio: se o produto não faz, diga que não faz. Se o item está no roadmap, diga em que fase está (`docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, seção F), sem data. Nunca cite cliente, número de resultado ou depoimento que não exista. Tudo que envolve ANS/TISS, ICP-Brasil, CFM/SBIS, LGPD ou contrato requer avaliação especializada; o vendedor não afirma conformidade.

## 1. TISS e convênios

**"Vocês geram o XML TISS para eu mandar à operadora?"**

- **Fato:** não. A tela de faturamento gera um arquivo de resumo e avisa que ele "não é arquivo TISS de transmissão" (`src/pages/FaturamentoConvenios.tsx:335`). O envio é feito no portal da operadora, e o sistema pede que você registre o envio depois (`:409`).
- **O que existe:** cadastro de convênio com registro ANS e versão TISS, lotes por competência, registro de glosa, recurso e valor recuperado (`FaturamentoConvenios.tsx:31-39`; trilha de treinamento em `src/pages/Treinamento.tsx:46-49`). Autorização de convênio com registro manual da resposta (`src/components/AutorizacaoConvenioModal.tsx`).
- **Resposta:** "Hoje o EloLab controla os lotes e as glosas, mas a geração e a transmissão do XML ainda acontecem no portal da operadora. O TISS está no roadmap como gate para clínicas com convênio e para redes, sem data definida. Se convênio é a maior parte do seu faturamento, o EloLab ainda não substitui o seu faturista."
- **Qualificação:** se mais da metade do faturamento vem de convênio e o envio precisa sair do sistema, registre como "não é o momento" e informe o `product-manager`.
- Requer avaliação especializada (ANS/TISS).

## 2. ICP-Brasil e prescrição

**"A assinatura vale juridicamente? Consigo fazer receita de controle especial?"**

- **Fato:** a assinatura do prontuário é eletrônica simples: grava autor, CRM, data e hash, bloqueia a edição e pode ser verificada pelo código (`src/components/clinical/DigitalSignature.tsx:193,209-211`; rota `/verificar-assinatura/:codigo`, `src/App.tsx:235`). Não usa certificado ICP-Brasil (`DigitalSignature.tsx:29-32`).
- A tela orienta usar a Memed para documentos que exigem ICP (`DigitalSignature.tsx:211-212`), mas a integração com a Memed está configurada só para homologação (`supabase/functions/memed-prescription/index.ts:46-54`). **Hoje não há caminho para receita de controle especial no EloLab.**
- **Resposta:** "A assinatura do EloLab registra quem assinou, quando e garante que o texto não mudou depois. Ela não é ICP-Brasil. Documentos que exigem certificado, como receita de controle especial, continuam fora do sistema por enquanto. ICP-Brasil está no roadmap da fase de diferenciação, sem data."
- **Não diga:** "tem validade jurídica", "é igual à ICP", "a Memed já está integrada".
- Requer avaliação especializada (jurídica e de certificação).

## 3. Migração de outro sistema

**"Vou perder meus dados? Quanto trabalho dá migrar?"**

- **Fato:** existe um importador em Configurações para pacientes e agenda, em .csv, .xlsx ou .xls (`src/components/importacao/ImportadorDePlanilha.tsx:160-162`; `src/pages/Configuracoes.tsx:1215`). Ele sugere a correspondência das colunas, mostra antes de gravar quantas linhas entram, quantas já existem e quantas têm erro, e devolve as recusadas em CSV (`ImportadorDePlanilha.tsx:280-320,139-147`). Pacientes já cadastrados são reconhecidos pelo CPF e não duplicam (`:397-400`).
- **Campos de paciente:** nome (obrigatório), CPF, nascimento, telefone, e-mail, sexo, endereço completo, responsável, CPF do responsável, carteirinha e observações (`src/lib/importacao/campos.ts:16-19`).
- **Campos de agenda:** paciente, CPF, nascimento, data, hora, profissional, tipo, situação e observações (`campos.ts:21-23`). A agenda só aceita pacientes que já existem: importe os pacientes antes (`ImportadorDePlanilha.tsx:195-203`). Status desconhecido entra como "agendado" (`campos.ts:283-293`).
- **O que não é importado:** histórico de prontuário, anexos, preços, convênios e financeiro. Não há importador para eles.
- **Formatos dos concorrentes:** o código foi escrito pensando em exportações da Feegow, iClinic e Ninsaúde (`campos.ts:5-8`), mas quais colunas cada sistema exporta hoje: NÃO VERIFICADO. Peça uma planilha de exemplo, com dados anonimizados, antes de prometer.
- **Resposta:** "Trazemos pacientes e agenda futura por planilha, e você vê o resultado antes de gravar. O histórico clínico fica no sistema antigo; recomendamos manter acesso de leitura a ele pelo prazo de guarda. Antes de fechar, testamos uma amostra anonimizada da sua exportação."
- A guarda do prontuário do sistema antigo requer avaliação especializada (jurídica: Lei 13.787/2018 e CFM).

**"E se eu quiser sair?"**

- Existe exportação clínica protegida por senha (`src/components/clinical/ExportacaoClinicaProtegida.tsx:20-41`). A exportação completa da clínica no cancelamento e a retenção do prontuário depois dele não foram executadas nem definidas (diagnóstico, seção C, "Cancelar assinatura e exportar"). Responda: "Há exportação; o procedimento completo de saída ainda vai ser formalizado em contrato." Requer avaliação especializada (jurídica).

## 4. Preço

**"Quanto custa? Por que é mais caro que o iClinic?"**

- **Fato:** dois planos por clínica: EloLab Pro, R$ 379 por mês, e EloLab Ultra, R$ 499 por mês, que é o Pro com o agente de IA no WhatsApp (`supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:1-22`). Laboratório e exames exigem o Pro (`src/App.tsx:264,268-271`). Limites de profissionais e funcionários por plano existem (`src/hooks/usePlanLimits.ts:40-66`), mas os valores de Pro e Ultra: NÃO VERIFICADO.
- **Teste:** o checkout pede cartão e cobra automaticamente depois do período de teste (`src/pages/PlanoCheckout.tsx:168-169`). A landing anuncia 3 dias (relatado em `docs/estrategia/funcoes/04-ux-gtm.md`, seção 4, `LandingPage.tsx:197`). Diga o número que estiver no checkout no dia.
- **Comparação pública** (04-ux-gtm, coletada em 27/10/2026): iClinic cobra de R$ 99 a R$ 299 por profissional; Clinicorp, R$ 159,90 e R$ 369,90 por clínica; Simples Dental, de R$ 149,90 a R$ 349,90. Esses números são dos sites dos concorrentes e podem mudar; não os use como afirmação sobre eles.
- **Resposta para consultório de 1 ou 2 profissionais:** "Para um consultório pequeno, nosso preço por clínica fica acima de quem cobra por profissional. Faz sentido se você usa recepção, caixa e prontuário juntos, ou laboratório. Se precisa só de agenda e prontuário, há opções mais baratas."
- **Resposta para clínica de 5 ou mais profissionais:** "Cobramos por clínica, não por profissional. Confira o limite de usuários do plano antes" (NÃO VERIFICADO até o `product-manager` confirmar os limites).
- **Não ofereça:** desconto, plano anual, plano de rede ou preço de laboratório. Não existem. A proposta de preço por porte está em `docs/gtm/pricing-proposta.md` (responsabilidade do `growth-marketing`) e depende de aprovação do responsável.

## 5. Outras objeções frequentes

| Objeção | Fato | Resposta |
|---|---|---|
| "Tem código de barras na coleta?" | Não. A etiqueta imprime o código em texto (`src/pages/MapaColeta.tsx:346-347`). A landing chegou a prometer isso (CLIN-QA-013) | "Ainda não. A etiqueta sai com o código em texto. Código de barras está no roadmap do laboratório, sem data" |
| "Integra com meus equipamentos?" | Não há interfaceamento (CLIN-QA-026) | "Não. Hoje o resultado é lançado na tela" |
| "Funciona para minhas 4 unidades?" | Não há multiunidade (CLIN-QA-024) | "Hoje cada unidade seria uma conta separada, sem visão consolidada. Não recomendamos para rede agora" |
| "Tem odontograma?" | Não (busca vazia em `src`) | "Não. Atendemos o núcleo de agenda, recepção, prontuário e caixa; odontograma está em descoberta" |
| "Emite nota fiscal? Tem Pix para o paciente?" | Não (CLIN-QA-025) | "Não. A nota continua no seu emissor atual" |
| "O WhatsApp marca consulta sozinho?" | Existe no código, mas a identificação do paciente pelo telefone tem P0 aberto (CLIN-QA-003). O WhatsApp usa conexão não oficial (Evolution), com risco de bloqueio do número (diagnóstico, G) | "O agente atende e passa para a recepção. O agendamento automático vai ser liberado depois de uma correção na identificação do paciente. Usamos uma conexão que pode sofrer bloqueio do WhatsApp; explicamos o risco antes de ativar" |
| "Os dados ficam seguros? Tem backup?" | Há correções reais de acesso, mas o isolamento entre clínicas ainda não foi provado em CI e o backup fica no mesmo servidor (CLIN-QA-002, CLIN-QA-005) | Não afirme certificação nem garantia. "Estamos fechando os pontos de backup externo e testes de isolamento antes de abrir o beta. Mostramos o relatório quando concluir." LGPD requer avaliação especializada |
| "Tem certificação SBIS?" | Não | "Não" |
| "Tem aplicativo?" | Há PWA instalável (`src/components/InstallPWA.tsx`). App nativo não testado em aparelho | "Pode instalar pelo navegador. App de loja ainda não" |
| "Vocês têm clientes como eu?" | Não há prova social autorizada | Não cite nomes nem números. "Estamos formando o grupo do beta" |
| "Tem telemedicina?" | Fora do escopo (`docs/time/REGRAS_DO_TIME.md:8`) | "Não, e não está nos planos" |

## 6. Registro

Cada objeção que encerrar ou atrasar uma venda vai para o registro de feedback (`saude-do-cliente.md`, seção 6), com segmento, porte e a funcionalidade em questão. Esse é o insumo do `product-manager` para priorizar TISS, ICP e os gates de segmento.
