# Pesquisa de UX, rodada 1: plano, roteiros e avaliação heurística do risco de paciente errado

Data: 27/10/2026
Autor: `ux-researcher`
Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com alterações locais não commitadas. As linhas citadas valem para esse estado do worktree.
Insumos: `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md` (itens 012, 017, 019, 034; ação 60.2) e `docs/estrategia/funcoes/04-ux-gtm.md` §1.

**Limite deste documento.** Nenhum teste com usuário foi feito e nenhuma tela foi aberta em navegador. A parte 1 é um plano. A parte 2 é avaliação heurística por leitura de código: toda afirmação sobre o que o usuário vê é inferida do JSX citado, e toda afirmação sobre comportamento do usuário é **hipótese** até o teste.

## Sumário

1. [Plano de pesquisa](#1-plano-de-pesquisa)
   - 1.1 Objetivos e perguntas
   - 1.2 Método e amostra
   - 1.3 Pré-requisitos e ambiente
   - 1.4 Massa de dados sintéticos
   - 1.5 Consentimento e tratamento dos dados do participante
   - 1.6 Estrutura da sessão
   - 1.7 Métricas, linha de base e critérios
   - 1.8 Roteiros por perfil (6 perfis × 5 tarefas)
   - 1.9 Análise e entrega
2. [Avaliação heurística por código: risco de paciente errado](#2-avaliação-heurística-por-código-risco-de-paciente-errado)
3. [Backlog derivado](#3-backlog-derivado)
4. [Não verificado e próximos passos](#4-não-verificado-e-próximos-passos)

---

## 1. Plano de pesquisa

### 1.1 Objetivos e perguntas

| # | Pergunta de pesquisa | Decisão que a resposta alimenta |
|---|---|---|
| Q1 | Ao registrar ou cobrar, o usuário confere o paciente? Com quais identificadores? Isso acontece quando há homônimo? | Reclassificar ou não o CLIN-QA-012 como P0; especificação do `PatientIdentityBar` |
| Q2 | As cinco tarefas diárias de cada perfil são concluídas sem ajuda, em quanto tempo e com quais erros? | Linha de base de UX (ação 60.2 do diagnóstico) |
| Q3 | Onde a densidade (texto de 9 a 11 px) e o número de abas atrasam ou induzem erro? | Prioridade do CLIN-QA-019 |
| Q4 | Para laboratório, rede e odonto: o fluxo atual atende ao trabalho real, ou a lacuna (código de barras, multiunidade, odontograma) bloqueia a adoção? | Gates de segmento (CLIN-QA-013, 024, 025, 034) |

### 1.2 Método e amostra

| Perfil | Método | Participantes | Duração | Prioridade |
|---|---|---|---|---|
| Recepção | Teste moderado de usabilidade + 5 min de entrevista | 5 | 45 min | Onda 1 |
| Médico | Teste moderado + entrevista | 5 | 45 min | Onda 1 |
| Financeiro/caixa | Teste moderado + entrevista | 5 | 45 min | Onda 2 |
| Técnico de laboratório | Teste moderado (fluxo existente) + entrevista de contexto | 5 | 60 min | Onda 2, só com piloto de laboratório |
| Gestor de rede | Entrevista de descoberta + 5 tarefas sobre o que já existe | 5 | 60 min | Onda 3 |
| Dentista | Entrevista de descoberta + 5 tarefas sobre o que já existe | 5 | 60 min | Onda 3 |

Justificativa do tamanho: 5 participantes por perfil encontram a maior parte dos problemas graves de um fluxo; o objetivo é achar problemas e montar a linha de base, não estimar taxas com precisão. Os números de cada perfil serão apresentados como contagem (por exemplo, "3 de 5"), sem porcentagem extrapolada.

Recrutamento:

- Critério de inclusão: exercer a função há pelo menos 3 meses em clínica, laboratório ou rede; usar algum sistema de gestão no trabalho.
- Mistura desejada por perfil: ao menos 2 participantes que nunca usaram o EloLab e ao menos 1 usuário atual (se houver), para separar aprendizado de defeito.
- Exclusão: funcionários do EloLab e familiares; pessoas que participaram de demo comercial nos últimos 30 dias.
- Incentivo: valor fixo declarado no termo, igual para todos, pago mesmo se a pessoa desistir no meio.
- Acessibilidade: perguntar no agendamento se o participante usa leitor de tela, ampliação ou tem baixa visão; quando houver, registrar a tecnologia usada (insumo para o CLIN-QA-017).

Ondas: onda 1 em até 2 semanas após o pré-requisito 1.3 estar pronto; onda 2 na semana seguinte; onda 3 depende do PM confirmar que redes e odonto continuam no horizonte (CLIN-QA-034).

### 1.3 Pré-requisitos e ambiente

| # | Pré-requisito | Dono | Estado |
|---|---|---|---|
| R1 | Ambiente de homologação separado da produção, com dados sintéticos (CLIN-QA-006 aponta que não existe staging) | Tech Lead + SRE | **Bloqueante.** Não testar em produção |
| R2 | Seed sintético da seção 1.4 carregado e reiniciável entre sessões | QA | Pendente |
| R3 | Contas de teste por perfil (recepção, médico, financeiro, laboratório, admin) na clínica sintética | QA | Pendente |
| R4 | Termo de consentimento revisado pelo DPO (seção 1.5) | DPO | **Requer avaliação especializada** |
| R5 | Correção do mojibake em textos de tela antes das sessões (CLIN-QA-018), para não medir defeito de codificação como problema de UX | Front | Pendente |
| R6 | Ferramenta de gravação de tela e áudio, com armazenamento sob controle do EloLab e prazo de exclusão configurável | UX | Pendente |

Sessão presencial: no computador da própria clínica do participante, com o navegador que ele usa no dia a dia, e resolução anotada. Sessão remota: participante compartilha a tela; o moderador não controla o computador.

### 1.4 Massa de dados sintéticos

Regra: nenhum dado real. Nomes gerados, CPFs inválidos por construção (dígito verificador errado de propósito), telefones na faixa fictícia `(00) 9xxxx-xxxx`. O seed precisa provocar a confusão que queremos medir:

| Caso | Composição | Mede |
|---|---|---|
| D1 Homônimos | Dois pacientes com nome civil idêntico ("Maria Aparecida Souza Lima"), nascimentos diferentes (1958 e 1991), ambos agendados no mesmo dia com médicos diferentes | Se o usuário diferencia pela data de nascimento ao fazer check-in, cobrar e registrar |
| D2 Nomes parecidos | "João Pedro Alves" e "João Pedro Álvares", horários vizinhos | Leitura apressada em lista |
| D3 Nome social | Paciente com nome social diferente do civil e alergia registrada | Se o usuário reconhece a mesma pessoa em telas que mostram nomes diferentes (achado 2.6) |
| D4 Alergia | Paciente com alergia a dipirona, agendado para consulta | Se o médico vê a alergia sem procurar |
| D5 Cobrança pendente | Dois lançamentos em aberto para pacientes D1 | Seleção do lançamento certo no caixa |
| D6 Menor de idade | Paciente de 9 anos com responsável | Identificação de responsável |
| D7 Laboratório | 8 amostras de 4 pacientes, 2 deles homônimos (D1) | Troca de amostra na coleta e no lançamento |
| D8 Volume | 40 agendamentos no dia, 3 médicos, 2 salas | Densidade real de recepção |

O seed vira script versionado (dono: QA) e é reiniciado antes de cada sessão.

### 1.5 Consentimento e tratamento dos dados do participante

**Requer avaliação especializada (DPO/jurídico).** O texto abaixo é modelo de trabalho, não parecer.

Modelo de termo (resumo das cláusulas):

1. Objetivo: avaliar a facilidade de uso do sistema EloLab. Avaliamos o sistema, não a pessoa.
2. O que acontece: sessão de até 60 minutos com tarefas num ambiente de teste com pacientes fictícios. Nenhum dado real de paciente é exibido ou pedido.
3. Gravação: tela e voz, somente com autorização marcada à parte. Imagem do rosto não é gravada. O participante pode pedir para pausar ou apagar a gravação a qualquer momento.
4. Uso: as gravações são vistas só pela equipe de produto do EloLab. Trechos citados em relatório são transcritos e atribuídos a código (`P-REC-03`), sem nome, clínica ou cargo identificável.
5. Retenção: gravações apagadas em até 90 dias após o relatório; transcrições anonimizadas mantidas como evidência do backlog.
6. Voluntariedade: a pessoa pode desistir a qualquer momento sem perder o incentivo e sem consequência para a clínica onde trabalha, inclusive se a clínica for cliente.
7. Sigilo: o participante não deve mencionar pacientes reais durante a sessão; se mencionar, o trecho é cortado da transcrição.
8. Contato do encarregado (DPO) para exercício de direitos.
9. Duas assinaturas: participação; gravação (opcional e separada).

Tratamento:

- Tabela de recrutamento (nome, contato) separada das notas de sessão; as notas usam só o código do participante.
- Nenhum dado do participante entra em `docs/`. Em `docs/ux/pesquisa/` só entram código, perfil, porte da clínica e anos de função.
- Quando o participante for funcionário de clínica cliente, o gestor dele não recebe resultados individuais.

### 1.6 Estrutura da sessão

| Minuto | Etapa | Notas para o moderador |
|---|---|---|
| 0–5 | Boas-vindas, termo, gravação | Ler o item 6 do termo em voz alta |
| 5–10 | Contexto | "Como é um dia normal seu? Que sistema usa? O que mais atrasa?" |
| 10–40 | 5 tarefas | Ler o cenário, entregar o cartão impresso, pedir que pense em voz alta. Não ensinar. Após 2 tentativas sem progresso ou ao atingir o tempo-limite, registrar falha e seguir. Aplicar SEQ ao fim de cada tarefa |
| 40–43 | SUS | Questionário padrão de 10 itens, versão em português |
| 43–45 | Encerramento | "O que mudaria primeiro?" Pagar incentivo |

Regra de segurança da sessão: se o participante cometer um erro de paciente (registrar, cobrar ou fazer check-in no paciente errado), o moderador **não interrompe**. Anota o momento e, no debriefing, pergunta o que ele viu na tela que o levou à escolha. Esse relato é a evidência central do Q1.

### 1.7 Métricas, linha de base e critérios

| Métrica | Definição | Coleta |
|---|---|---|
| Sucesso | 1 = concluiu sem ajuda e o estado final está correto; 0,5 = concluiu com um erro recuperado por conta própria; 0 = falhou, desistiu, precisou de ajuda ou terminou com estado errado | Observação + conferência no banco de homologação |
| Tempo na tarefa | Do fim da leitura do cenário até a ação final confirmada | Gravação |
| Cliques | Cliques e teclas de ação até a conclusão | Gravação |
| Erros | Contagem por tipo: **crítico** (paciente, lançamento, amostra ou médico errados persistidos), recuperável, navegação | Observação |
| Conferência de identidade | O participante leu em voz alta ou apontou o segundo identificador (nascimento) antes de confirmar? Sim/não | Observação, pensar em voz alta |
| SEQ | "No geral, esta tarefa foi..." 1 (muito difícil) a 7 (muito fácil) | Após cada tarefa |
| SUS | 10 itens, 0–100 | Fim da sessão |

Linha de base: a rodada 1 **é** a linha de base. Não existe medição anterior; os tempos-limite das tabelas abaixo servem só para encerrar a tarefa e não são meta.

Critérios de decisão:

- **Qualquer erro crítico de paciente** em qualquer sessão: o CLIN-QA-012 e os itens 541–546 deste documento sobem para P0, conforme a condição já escrita no diagnóstico.
- Tarefa com sucesso em menos de 4 de 5 participantes: gera item de backlog P1 se for tarefa principal do perfil, P2 nas demais.
- SUS médio do perfil abaixo de 70 (meta da ação 60.2): revisão do fluxo do perfil antes do beta.
- Meta da próxima rodada, depois das correções: sucesso ≥ 4 de 5 em todas as tarefas principais, zero erro crítico e SUS ≥ 70.

### 1.8 Roteiros por perfil

Formato de cada tarefa: cenário lido ao participante (sem usar o nome do botão), critério de sucesso verificável, tempo-limite e erros a observar. Rotas conferidas em `src/App.tsx` (`/recepcao` :293, `/prontuarios` :259, `/caixa-diario` :295, `/laboratorio` :268, `/mapa-coleta` :269, `/laudos-lab` :271, `/fila` :278, `/relatorios` :309, `/dashboard` :248, `/faturamento-convenios` :286).

#### Recepção (conta de recepção, tela inicial `/recepcao`)

| # | Cenário | Sucesso | Limite | Erros a observar |
|---|---|---|---|---|
| R1 | "Chegou a senhora Maria Aparecida Souza Lima, nascida em 1958, para a consulta das 9h. Registre a chegada dela." (D1) | Check-in no agendamento da paciente de 1958; cobrança gerada para ela | 3 min | **Crítico:** check-in na homônima de 1991. Clique em "Check-in" do card vizinho após a lista se mover |
| R2 | "Um paciente que já tem cadastro chegou sem horário marcado. Coloque-o para ser atendido agora com a Dra. X, consulta simples." (D2) | Encaixe criado e check-in feito para "João Pedro Álvares" | 4 min | **Crítico:** escolher "Alves". Desistir por não achar o caminho |
| R3 | "A senhora Maria Aparecida de 1958 precisa pagar a consulta: metade no Pix, metade no cartão de crédito." (D1, D5) | Pagamento dividido registrado no lançamento dela, saldo zero | 4 min | **Crítico:** receber no lançamento da homônima. Valor dividido errado |
| R4 | "A paciente das 10h pediu para trocar a consulta para quinta-feira com outro médico." | Agendamento remarcado com o médico e a data pedidos, sem duplicata | 4 min | Criar novo sem cancelar o antigo; trocar o paciente |
| R5 | "O paciente com nome social Alex (D3) mudou de telefone e de convênio. Atualize." | Telefone e convênio atualizados no cadastro certo | 3 min | Não reconhecer o paciente porque a tela mostra outro nome |

#### Médico (conta de médico, tela inicial `/fila`)

| # | Cenário | Sucesso | Limite | Erros a observar |
|---|---|---|---|---|
| M1 | "Chame o próximo paciente que está esperando por você." | Atendimento iniciado do primeiro da fila do médico | 2 min | Chamar paciente de outro médico ou fora de ordem |
| M2 | "Registre a consulta: queixa de cefaleia há 3 dias e o diagnóstico com o código CID adequado." (paciente D1 de 1991) | Evolução salva no prontuário da paciente de 1991, com CID | 6 min | **Crítico:** salvar no prontuário da homônima. Perder texto ao fechar o diálogo |
| M3 | "Prescreva o medicamento que você costuma usar nesse caso e assine." (paciente D4) | Prescrição salva e assinada | 6 min | Não perceber a alergia a dipirona; não encontrar a assinatura. Não avaliar a conduta clínica: o moderador não julga o medicamento |
| M4 | "Antes de prescrever, descubra se o paciente tem alguma alergia e quando foi a última consulta." (D3) | Responde corretamente as duas informações | 2 min | Procurar alergia só no campo de texto da evolução |
| M5 | "Marque o retorno desse paciente para daqui a 30 dias." | Retorno agendado para o paciente certo na data certa | 3 min | Agendar para outro paciente; não achar a opção |

#### Financeiro/caixa (conta financeira, tela inicial `/caixa-diario`)

| # | Cenário | Sucesso | Limite | Erros a observar |
|---|---|---|---|---|
| F1 | "Comece o dia: abra o caixa com R$ 200 de troco." | Caixa aberto com R$ 200 | 2 min | Abrir com valor errado |
| F2 | "A paciente Maria Aparecida, de 1991, comprou um exame de hemograma e pagou em dinheiro. Registre a venda." (D1) | Venda registrada e vinculada à paciente de 1991 | 4 min | **Crítico:** vincular à homônima (o exame vai para o prontuário dela, ver 2.8). Venda sem paciente |
| F3 | "Um lançamento de despesa de hoje foi feito com valor errado. Corrija." | Lançamento corrigido, sem duplicata | 3 min | Corrigir o lançamento errado |
| F4 | "Feche o caixa. Você contou R$ 15 a menos do que o esperado." | Caixa fechado com diferença e justificativa | 4 min | Não entender o "dinheiro esperado"; fechar sem justificar |
| F5 | "Descubra se a senhora Maria Aparecida de 1958 tem algum pagamento pendente e de quanto." (D5) | Informa o valor correto da paciente de 1958 | 3 min | **Crítico:** informar o pendente da homônima |

#### Técnico de laboratório (conta de laboratório; só com piloto de laboratório)

O produto não tem código de barras (CLIN-QA-013): a etiqueta é texto (`src/pages/MapaColeta.tsx:346-347`, conforme diagnóstico). As tarefas medem o fluxo atual e a entrevista mede a lacuna.

| # | Cenário | Sucesso | Limite | Erros a observar |
|---|---|---|---|---|
| L1 | "Registre a coleta de sangue da paciente Maria Aparecida de 1958 e imprima a etiqueta." (D7) | Coleta registrada na amostra dela, etiqueta gerada | 4 min | **Crítico:** coleta na amostra da homônima |
| L2 | "Lance o resultado de glicemia de jejum: 92 mg/dL." | Resultado salvo no exame certo | 4 min | **Crítico:** lançar no exame de outro paciente; unidade errada |
| L3 | "Libere o laudo desse exame para o paciente." | Laudo liberado | 3 min | Não entender o estado `validado` exigido antes da liberação |
| L4 | "Quais exames estão atrasados hoje?" | Lista correta | 2 min | Não achar filtro |
| L5 | "Envie o resultado ao paciente." | Envio registrado para o paciente certo | 3 min | Envio para o contato errado |

Entrevista (10 min): como identificam amostras hoje; se trabalham com leitor de código de barras; quem valida e quem libera (insumo para o CLIN-QA-022, sem avaliar a conformidade regulatória, que requer avaliação especializada).

#### Gestor de rede (conta de administrador)

O produto não tem multiunidade (CLIN-QA-024: 0 ocorrências de `unidade_id`). As tarefas avaliam o que um gestor faz hoje numa única clínica; a entrevista é a descoberta do CLIN-QA-034. **Não apresentar o produto como pronto para redes**.

| # | Cenário | Sucesso | Limite | Erros a observar |
|---|---|---|---|---|
| G1 | "Qual foi a ocupação da agenda nesta semana?" | Informa o número correto | 3 min | Confundir agendados com atendidos |
| G2 | "Convide um novo médico para a equipe." | Convite enviado com o papel certo | 4 min | Papel errado |
| G3 | "Cadastre um novo tipo de consulta com preço de R$ 250." | Tipo criado e disponível na recepção | 4 min | Preço não chega à cobrança |
| G4 | "Quanto a clínica faturou no mês passado?" | Valor correto | 3 min | Confundir faturado com recebido |
| G5 | "Se você tivesse 3 unidades, como compararia o faturamento delas?" (tarefa de descoberta: o participante descreve e mostra no sistema dele) | Não há sucesso; registrar o fluxo e a necessidade | 5 min | — |

Entrevista (20 min): estrutura da rede, quem vê o quê por unidade, consolidação financeira, padronização de cadastro, papéis por unidade.

#### Dentista (conta de médico/profissional)

O produto não tem odontograma nem orçamento clínico (0 ocorrências de `odontograma` e de `orcamento` fora de `ContasPagar.tsx` e `ContasReceber.tsx`). As tarefas medem o núcleo comum e a entrevista mede a lacuna. **Não apresentar como produto odontológico.**

| # | Cenário | Sucesso | Limite | Erros a observar |
|---|---|---|---|---|
| O1 | "Chame o próximo paciente." | Atendimento iniciado do paciente certo | 2 min | Como M1 |
| O2 | "Registre o atendimento de hoje: restauração no dente 36." | Evolução salva no paciente certo; registrar onde o participante tentou indicar o dente | 6 min | **Crítico:** paciente errado. Observar a busca por odontograma |
| O3 | "Verifique se o paciente tem alergia antes de anestesiar." (D4) | Responde corretamente | 2 min | Como M4 |
| O4 | "O paciente vai fazer um tratamento em 4 sessões. Agende as próximas." | 3 retornos agendados | 5 min | Agendar para outro paciente |
| O5 | "Como você registraria um orçamento de tratamento para esse paciente?" (descoberta) | Não há sucesso; registrar fluxo esperado | 5 min | — |

Entrevista (20 min): odontograma, orçamento e aprovação, planos odontológicos, imagens.

### 1.9 Análise e entrega

- Planilha por sessão: tarefa, sucesso, tempo, cliques, erros por tipo, conferência de identidade, SEQ, citação-chave anonimizada.
- Síntese por problema, não por tela: frequência (x de 5), gravidade pela rubrica de `REGRAS_DO_TIME.md`, evidência (código do participante + minuto da gravação + `caminho:linha`).
- Relatório em `docs/ux/pesquisa/rodada-1-resultados.md`, com os itens `CLIN-QA-5xx` atualizados (confirmado, refutado ou reclassificado).
- Instrumentação futura: as mesmas tarefas viram eventos do plano de analytics (CLIN-QA-016), sem dado de paciente, para comparar laboratório e uso real.

---

## 2. Avaliação heurística por código: risco de paciente errado

Escopo: `src/pages/Recepcao.tsx`, `src/pages/Prontuarios.tsx`, `src/pages/CaixaDiario.tsx` e o componente compartilhado `src/components/patients/PacienteCombobox.tsx`. Critério: em todo ponto em que o sistema **grava** dado clínico ou financeiro de um paciente, há dois identificadores visíveis (nome completo e data de nascimento) e o vínculo gravado é o mesmo que está à vista?

Legenda: **Observado** = o código mostra isso. **Hipótese** = efeito no usuário, a confirmar no teste.

### 2.1 Pontos de gravação mapeados

| Tela | Ação que grava | Identificação visível no momento da confirmação | Dois identificadores? |
|---|---|---|---|
| Recepção, card do dia | Check-in (gera cobrança) | Nome social ou civil, hora, médico (`Recepcao.tsx:1229-1242`) | Não |
| Recepção, encaixe | Cria agendamento + check-in | Na busca: nome, CPF, telefone, nascimento (`PacienteCombobox.tsx:80-83`). Após selecionar: só o nome (`:48`) | Só durante a busca |
| Recepção, "Confirmar Pagamento" | Recebe pagamento | Texto livre `descricao` do lançamento (`Recepcao.tsx:1535`) | Não |
| Prontuário, diálogo de edição | Salva evolução e prescrição | Nome civil em `text-[10px]`, idade "42a", CPF completo, convênio (`Prontuarios.tsx:2071-2077`); nome em texto secundário no título (`:2006`) | Não (idade, não nascimento) |
| Caixa, Ponto de Venda | Venda; exames vão para o prontuário | Na busca: nome e CPF em 10 px (`CaixaDiario.tsx:1889-1891`). Após selecionar: só o nome (`:1830`) | Não |
| Caixa, lista de lançamentos | Imprimir recibo, editar, remover | Só `descricao` (`CaixaDiario.tsx:1265`); recibo usa o nome do paciente, que não aparece na lista (`:965`) | Não |

### 2.2 Achado A: o diálogo de pagamento da Recepção não mostra o paciente

**Observado.** O diálogo "Confirmar Pagamento" exibe `selectedLancamento.descricao` como único texto de identificação (`Recepcao.tsx:1535`), seguido de valores. O título e a descrição são genéricos (`:1519-1521`). O objeto do paciente existe no estado (`setSelectedPacienteBalcao(pac)`, `:628`), mas só é usado para gerar o comprovante depois do pagamento (`:887`).

A `descricao` normalmente contém o nome porque a cobrança automática a monta como `"<tipo> - <nome> - <tipo de consulta>"` (`src/lib/autoBilling.ts:400-402`). Ela não tem data de nascimento, é um retrato do nome na hora da cobrança e pode conter o literal "Paciente" quando o nome não carregou (`Recepcao.tsx:594`, `pac?.nome || 'Paciente'`).

**Mitigante observado.** O lançamento é ligado ao card por `agendamento_id` (`Recepcao.tsx:409`, `:581`), não por nome; o diálogo só abre a partir do card do paciente. O risco é de **confirmação**, não de vínculo: com homônimos (D1), nada no diálogo permite conferir qual dos dois está pagando.

**Hipótese.** Com fila no balcão, a recepcionista confirma pelo valor, não pelo paciente.

Isso confirma, no código atual, o CLIN-QA-402 (antes SÓ RELATADO no diagnóstico).

### 2.3 Achado B: check-in com um clique em lista que se reorganiza em tempo real

**Observado.** O botão "Check-in" chama `handleCheckin(ag.id)` direto, sem confirmação (`Recepcao.tsx:1296-1303`), e o check-in gera a cobrança na mesma transação (`src/lib/checkinWithBilling.ts`, conforme diagnóstico, jornada "Recepcionar"). A lista assina mudanças em `agendamentos`, `fila_atendimento`, `lancamentos` e `caixa_diario` (`Recepcao.tsx:366-383`) e anima entradas e saídas (`AnimatePresence mode="popLayout"`, `:1194`; `layout` no card, `:1200`). A aba de check-in filtra `step === 0` (`:419`): quando um paciente é registrado, por esta ou por outra estação, o card sai e os de baixo sobem.

**Mitigante observado.** Todos os botões ficam desabilitados durante o processamento (`disabled={isProcessing}`, `:1299`), o que evita duplo clique *durante* a gravação.

**Hipótese.** Depois que o primeiro check-in termina, ou quando outra recepção registra alguém, o botão do card seguinte ocupa a posição sob o cursor. Um segundo clique rápido registra a chegada, e gera a cobrança, de outro paciente. O card não tem nascimento (`:1227-1254`), então homônimos são indistinguíveis.

### 2.4 Achado C: o card da Recepção identifica só pelo nome

**Observado.** O card mostra `nome_social || nome` (`Recepcao.tsx:1229`), hora, médico, sala e tipo (`:1237-1253`). Não há data de nascimento nem idade. A indicação de alergia é um badge de 10 px com ícone de 2,5 unidades (`:1231-1235`).

**Hipótese.** Em D1 (homônimos no mesmo dia), a única pista é o horário ou o médico.

### 2.5 Achado D: faixa de identificação do prontuário em edição

**Observado** (confirma CLIN-QA-401/012 no estado atual):

- Nome civil num `Badge` com `text-[10px]` (`Prontuarios.tsx:2072-2073`).
- Idade abreviada (`42a`) em vez de data de nascimento (`:2075`).
- CPF completo (`:2076`), dado desnecessário para a tarefa clínica (CLIN-QA-403).
- Sem alergias cadastrais na faixa. Dentro do diálogo, as alergias cadastrais só aparecem no verificador de interações, e só depois de haver prescrição (`:2352-2356`). O campo "Alergias" da evolução (`:2206-2210`) é texto editável pré-preenchido na criação (`:931`), não o cadastro. O `AllergyAlert` (`:330-332`) e o `ClinicalSafetyPanel` (`:1781`) ficam na ficha, fora do diálogo.
- O título repete o nome em texto secundário (`:2006`), o que ajuda, mas sem segundo identificador.

### 2.6 Achado E: o mesmo paciente aparece com nomes diferentes entre telas

**Observado.**

| Lugar | Nome exibido | Evidência |
|---|---|---|
| Card da Recepção | social, senão civil | `Recepcao.tsx:1229` |
| Busca de paciente (combobox) | social, senão civil | `PacienteCombobox.tsx:48`, `:80` |
| Ficha no prontuário | social em destaque; civil em `text-[11px]` | `Prontuarios.tsx:277-282` |
| Rascunhos do prontuário | social, senão civil | `Prontuarios.tsx:1690` |
| **Faixa do diálogo de edição** | **só civil** | `Prontuarios.tsx:2073` |
| Título do diálogo de edição | só civil | `Prontuarios.tsx:2006` |
| Ponto de venda do caixa | social, senão civil | `CaixaDiario.tsx:1883`, `:1889` |

**Hipótese.** Para paciente com nome social (D3), o médico escolhe "Alex" na lista e o editor mostra outro nome. Ou ele estranha e perde tempo, ou se acostuma a ignorar a faixa, o que anula a função dela. A regra de exibição do nome social (quando mostrar um, outro ou os dois) **requer avaliação especializada**. A recomendação de UX é só a consistência: o mesmo par de nomes em toda tela de gravação.

### 2.7 Achado F: a faixa mostra um paciente e a gravação usa outro identificador

**Observado.** A faixa e o título leem `selectedPaciente`, consultado a partir de `selectedPacienteId` (`Prontuarios.tsx:870-878`). A gravação usa `currentProntuario.paciente_id`, fixado na abertura (`:927`, `:1271`). Nada no diálogo confere que os dois são iguais. `selectedPacienteId` pode mudar por efeito de rota, independente do diálogo (`:946-951`).

**Mitigantes observados.** O diálogo é modal, o que bloqueia a lista de pacientes. O atalho vindo da Fila confere no servidor que o agendamento pertence ao paciente antes de abrir (`:1036-1063`). A atualização usa controle de concorrência por `updated_at` (`:1259-1267`).

**Hipótese a verificar (QA).** Se a rota mudar com o diálogo aberto (por exemplo, um link da Fila ou de notificação para outro paciente), a faixa passa a mostrar o paciente B enquanto o salvamento grava no A. **NÃO VERIFICADO** se esse caminho é alcançável na interface. Se for, é P0 pela rubrica.

### 2.8 Achado G: venda no caixa grava exame no prontuário com identificação mínima

**Observado.** O paciente é opcional no ponto de venda (`CaixaDiario.tsx:1820-1825`), mas obrigatório quando há exame no carrinho, porque "Exames serão registrados no prontuário do paciente" (`:1909-1912`, validação em `:763-765`, envio em `:800`). Na busca, cada resultado mostra nome e CPF em `text-[10px]`, sem nascimento (`:1888-1893`). Depois da escolha, só o nome, truncado (`:1830`). "Finalizar Venda" grava direto, sem resumo de confirmação (`:1956-1960`).

**Mitigante observado.** A busca descarta resultados antigos enquanto busca de novo (`:493-494`), o mesmo padrão do `PacienteCombobox.tsx:30-32`, o que evita o clique num resultado de uma busca anterior.

**Hipótese.** O caixa, sob fila, escolhe o primeiro nome que bate. Como o efeito é um exame no prontuário de outra pessoa, o impacto é clínico, não só financeiro.

### 2.9 Achado H: a lista do caixa e o recibo não batem na identificação

**Observado.** A tabela de lançamentos mostra tipo, `descricao`, forma, hora e valor (`CaixaDiario.tsx:1260-1281`), sem coluna de paciente. O recibo usa `paciente_nome || pacientes?.nome || 'Paciente'` (`:965`). Em vendas do ponto de venda, a `descricao` é só a lista de itens (`:766`), sem nome. O diálogo de remoção não diz o que será removido (`:2265-2266`), mas só vale para lançamentos que não são receita (`:1296`).

**Hipótese.** Na tarefa F5 (pendente de um paciente) e ao reimprimir recibo, o operador não consegue conferir a quem pertence o lançamento sem abrir o PDF.

### 2.10 Densidade

**Observado.** 81 ocorrências de `text-[9px]`, `text-[10px]` ou `text-[11px]` nas três telas: Prontuários 67, Caixa 11, Recepção 3 (comando na seção 4). Na faixa de identificação há badge de 9 px (`Prontuarios.tsx:2078`).

### 2.11 Pontos positivos observados

- Vínculo por chave, não por nome: lançamento ↔ agendamento (`Recepcao.tsx:409`), atalho da Fila conferido no servidor (`Prontuarios.tsx:1036-1063`).
- Busca de paciente que não oferece resultado antigo (`PacienteCombobox.tsx:30-32`; `CaixaDiario.tsx:493-494`), com nascimento e CPF no combobox (`PacienteCombobox.tsx:82`).
- Encaixe bloqueado enquanto o paciente não for confirmado na clínica (`Recepcao.tsx:1775-1788`, `:1826`).
- Idempotência no pagamento (`Recepcao.tsx:640-642`) e na venda (`CaixaDiario.tsx:768-781`).
- Estados de carregamento e erro explícitos nos pontos de seleção (`Recepcao.tsx:1775-1787`; `CaixaDiario.tsx:1863-1873`; `Prontuarios.tsx:1761-1768`).

### 2.12 Cliques estimados até a tarefa principal (por código, a medir)

| Tarefa | Caminho inferido | Cliques estimados |
|---|---|---|
| Check-in de agendado | aba Check-in → "Check-in" no card | 1–2 |
| Receber pagamento | aba Balcão → "Receber" → forma → "Confirmar Pagamento" | 4 |
| Pagamento dividido | + "Dividir com outra forma" → forma → valor | 7–8 |
| Encaixe | abrir encaixe → buscar → escolher paciente → médico → tipo → confirmar | 6 + digitação |
| Nova evolução | buscar paciente → escolher → "Novo Atendimento" → preencher → salvar | 4 + digitação |

**NÃO VERIFICADO:** qual aba abre por padrão e onde fica o botão de encaixe; o teste mede o real.

---

## 3. Backlog derivado

IDs na faixa 5xx. Como 17 agentes trabalham em paralelo sem reserva de faixa em `docs/time/rodada-1/TAREFAS.json`, usei 541–548 para reduzir colisão; o dono do backlog pode renumerar. Todos são P1 por ora; os marcados com "P0 se" sobem pela regra do diagnóstico (012) se o teste registrar erro crítico de paciente.

| ID | P | Título | Impacto | Evidência | Causa provável | Proposta | Esf. | Teste de aceite | Dono |
|---|---|---|---|---|---|---|---|---|---|
| CLIN-QA-541 | P1 (P0 se R3/F5 falharem) | Diálogo de pagamento da Recepção sem identificação do paciente | Clínico-financeiro: pagamento confirmado sem conferir o paciente | `Recepcao.tsx:1519-1535`, `:628`, `:887`, `:594`; `autoBilling.ts:400-402` | Diálogo desenhado em torno do lançamento | Mostrar nome (social e civil, ver 546) e nascimento a partir de `selectedPacienteBalcao`, acima do valor | S | Com D1, o diálogo exibe nome e nascimento da paciente certa antes de "Confirmar"; teste de componente cobre nome ausente | Front + Product designer |
| CLIN-QA-542 | P1 (P0 se R1 falhar) | Check-in de um clique em lista que se move | Clínico-financeiro: chegada e cobrança no paciente errado | `Recepcao.tsx:1296-1303`, `:366-383`, `:419`, `:1194`, `:1200` | Ação irreversível sem pausa em lista animada | Avaliar: (a) congelar a posição dos cards enquanto o ponteiro estiver sobre a lista; (b) desfazer por alguns segundos; (c) mostrar nascimento no card. A solução é do product-designer | M | Em teste com D1 e D8, nenhum check-in no card vizinho; teste e2e com mudança de realtime durante o clique | Product designer + Front |
| CLIN-QA-543 | P1 | Card da Recepção sem segundo identificador | Homônimos indistinguíveis | `Recepcao.tsx:1227-1254` | Card pensado para leitura rápida | Data de nascimento (ou idade + ano) no card; alergia com rótulo legível | S | Com D1, os dois cards se distinguem sem abrir nada | Product designer + Front |
| CLIN-QA-544 | P1 | Faixa do prontuário em edição sem nascimento nem alergias cadastrais | Evolução ou prescrição no paciente errado; alergia não vista | `Prontuarios.tsx:2071-2077`, `:2352-2356`, `:330-332` | Faixa criada como resumo | Implementa o `PatientIdentityBar` do CLIN-QA-012 (é o mesmo item no estado atual) | M | Aceite do 012 | Product designer + Front |
| CLIN-QA-545 | P1 (P0 se reproduzido) | Faixa do prontuário e gravação usam fontes diferentes de paciente | Mostra um paciente e grava em outro | `Prontuarios.tsx:870-878`, `:927`, `:946-951`, `:1271` | Dois estados independentes para o mesmo conceito | QA: teste que muda a rota com o diálogo aberto. Front: a faixa lê o paciente de `currentProntuario.paciente_id`; bloquear salvamento se divergir de `selectedPacienteId` | S | Teste de integração: mudar `?paciente=` com o diálogo aberto não altera a faixa ou bloqueia o salvamento com mensagem | QA + Front |
| CLIN-QA-546 | P1 | Nome social e civil inconsistentes entre telas | Usuário não reconhece o paciente, ou aprende a ignorar a faixa | Tabela da seção 2.6 | Cada tela decide sozinha | Uma função única de exibição de nome usada em toda tela de gravação. A política de nome social requer avaliação especializada | S | Com D3, o mesmo par de nomes aparece na Recepção, no prontuário (lista, ficha, faixa) e no caixa | Front + PO + DPO |
| CLIN-QA-547 | P1 (P0 se F2 falhar) | Venda de exame no caixa vincula prontuário com nome e CPF de 10 px | Exame no prontuário de outra pessoa | `CaixaDiario.tsx:1826-1830`, `:1888-1893`, `:1909-1912`, `:763-765`, `:800`, `:1956-1960` | Paciente tratado como dado opcional da venda | Usar o `PacienteCombobox` (que já mostra nascimento); exibir nome e nascimento do escolhido; resumo antes de "Finalizar Venda" quando houver exame | S | Com D1, o caixa vê o nascimento antes de finalizar; teste de componente cobre o resumo | Front |
| CLIN-QA-548 | P2 | Lista do caixa sem paciente; recibo com paciente oculto | Conferência e reimpressão no paciente errado | `CaixaDiario.tsx:1260-1281`, `:965`, `:766` | Tabela orientada a caixa, não a paciente | Coluna de paciente (nome curto) para receitas; remover fallback "Paciente" do recibo quando houver `paciente_id` | S | Na F5, o participante encontra o pendente sem abrir PDF | Front |

Relação com o diagnóstico: 541 e 547 detalham o CLIN-QA-402 (parte do 012); 544 é o 401/012 confirmado; 543, 545 e 546 são novos; 548 é novo; a densidade (2.10) alimenta o 019.

---

## 4. Não verificado e próximos passos

Comandos e buscas executados nesta rodada (leitura, sem alteração de código):

- Grep `text-\[(9|10|11)px\]` em `src/pages/{Recepcao,Prontuarios,CaixaDiario}.tsx` → 81 ocorrências (Caixa 11, Recepção 3, Prontuários 67).
- Grep `nome_social` nas três telas → 11 ocorrências (Caixa 2, Prontuários 7, Recepção 2); a faixa de edição (`Prontuarios.tsx:2073`) não usa.
- Grep `orcamento|odontolog|plano_tratamento` (sem distinção de caixa) em `src` → só `ContasPagar.tsx` e `ContasReceber.tsx`.
- Grep `CLIN-QA-5\d\d` em `docs` → nenhuma ocorrência no momento da escrita.
- Leitura dos trechos citados em `Recepcao.tsx`, `Prontuarios.tsx`, `CaixaDiario.tsx`, `PacienteCombobox.tsx`, `autoBilling.ts`.

NÃO VERIFICADO:

- Toda a parte visual: tamanho real renderizado, rolagem, posição dos botões, aba padrão da Recepção.
- Se o caminho do achado F (rota muda com diálogo aberto) é alcançável.
- Se a reorganização da lista (achado B) acontece sob o cursor na prática; depende do layout e da taxa de eventos.
- Conteúdo real de `descricao` em lançamentos criados por caminhos que não passam por `autoBilling.ts`.
- `MapaColeta.tsx:346-347` (etiqueta em texto) foi citado a partir do diagnóstico, não reaberto.

Próximos passos e donos:

1. **Tech Lead + SRE:** ambiente de homologação (R1). Sem ele, a pesquisa não começa.
2. **QA:** seed sintético da seção 1.4 (R2, R3) e teste do achado F (CLIN-QA-545).
3. **DPO:** revisar o termo (R4) e a política de nome social (CLIN-QA-546).
4. **Product designer:** soluções para 541–544, 546 e 547, partindo do `PatientIdentityBar`.
5. **UX researcher:** recrutar a onda 1 (5 recepcionistas, 5 médicos) quando R1–R4 estiverem prontos.
