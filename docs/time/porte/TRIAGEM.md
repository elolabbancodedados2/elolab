# Triagem dos patches fora das atribuições da rodada 4

Data: 27/10/2026. Responsável: `codex-triagem`.

Base da decisão: resumos das rodadas 1–3, `docs/time/planos/ESTAB-7D-itens-3-4.md` e tarefas da rodada 4. Foram excluídos desta tabela os patches atribuídos nesta rodada a outros agentes, conforme `docs/time/rodada-4/TAREFAS.json`.

| Patch | Decisão | Evidência e motivo |
|---|---|---|
| `src_App.tsx.patch` | outra frente, não portar | Adiciona rota de perfil médico. Não consta como entrega de produto nas tarefas/resumos das rodadas 1–3. |
| `src_components_agenda_AppointmentDialog.tsx.patch` | outra frente, não portar | Define tipo de consulta padrão e altera gravação/duração; mudança de agenda não atribuída nos resumos. O relatório da rodada 2 registra inclusive um defeito na regex dessa frente (`rodada-2/tech-lead-final.md`, seção 3.1). |
| `src_components_clinical_DigitalSignature.tsx.patch` | outra frente, não portar | Altera a descrição de assinatura ICP-Brasil. O especialista exige avaliação especializada; não há autorização ou tarefa para mudar essa afirmação. |
| `src_components_ErrorState.tsx.patch` | outra frente, não portar | Refatora tradução/heurística de erros; não há tarefa correspondente. A regra geral de erros em `REGRAS_DO_TIME.md` não atribui este patch à equipe. |
| `src_components_importacao_ImportadorDePlanilha.tsx.patch` | outra frente, não portar | Troca mensagens de erro do importador, sem tarefa correspondente nos resumos. |
| `src_components_whatsapp_types.ts.patch` | portado parcialmente | A rodada 1 do tech lead inclui explicitamente esses textos (`rodada-1/tech-lead.md`, “7.4a WhatsApp”). Atualizei apenas as descrições de criar e consultar agendamento para exigir confirmação de CPF e nascimento e limitar os dados exibidos; linhas 17–18 de `src/components/whatsapp/types.ts`. |
| `src_hooks_useSubscriptionPlan.ts.patch` | outra frente, não portar | Altera mensagem do fluxo de assinatura de plano; não consta das tarefas/resumos da equipe. |
| `src_index.css.patch` | outra frente, não portar | Mudanças globais de tokens e apresentação visual, sem tarefa de código correspondente; a rodada 1 atribuiu o design system a documentação, sem editar código. |
| `src_integrations_supabase_types.ts.patch` | outra frente, não portar | Atualização de tipos gerados sem vínculo demonstrado com uma tarefa dos resumos 1–3. |
| `src_lib_checkinWithBilling.ts.patch` | outra frente, não portar | Corrige pontuação na mensagem de falha. A rodada 1 apenas registrou a não atomicidade como divergência/hipótese a revisar (`rodada-1/CONSOLIDADO.md`, seção 4, item 6); não pediu essa alteração. |
| `src_lib_cookies.ts.patch` | intenção já presente; sem alteração adicional | O evento de consentimento está no plano de analytics da rodada 1 (`docs/gtm/plano-analytics.md`, seção 3.3) e já existe no checkout atual: `src/lib/cookies.ts:17,40`, com consumidor em `src/components/Version20Announcement.tsx:37`. O restante da integração de analytics depende da escolha/aprovação da ferramenta e não foi portado. |
| `src_pages_AceitarConvite.tsx.patch` | outra frente, não portar | Mudanças de interface/fluxo de convite não aparecem como tarefa dos resumos 1–3. |
| `src_pages_Atestados.tsx.patch` | outra frente, não portar | Ajustes de tela de atestados não aparecem como tarefa dos resumos; o tema regulatório requer avaliação especializada. |
| `src_pages_Auth.tsx.patch` | outra frente, não portar | Alterações de autenticação/cadastro não correspondem a uma tarefa atribuída nos resumos. |
| `src_pages_Convenios.tsx.patch` | outra frente, não portar | Mudanças de tela de convênios não foram pedidas; a análise de domínio da rodada 1 documenta o estado atual, sem tarefa de implementação. |
| `src_pages_DemonstracaoClinica.tsx.patch` | outra frente, não portar | Mudança de interface da demonstração, sem tarefa correspondente. |
| `src_pages_FaturamentoConvenios.tsx.patch` | outra frente, não portar | Ajustes de erros e interface de faturamento não foram atribuídos; a rodada 1 pediu análise do processo, não alterações nessa tela. |
| `src_pages_Fila.tsx.patch` | outra frente, não portar | Ajusta toasts e mensagens da fila. A hipótese de cobrança/check-in da rodada 1 não autoriza essa alteração e permanece pendente de verificação. |
| `src_pages_LaudosLab.tsx.patch` | outra frente, não portar | Ajustes de mensagens e notificações de laudos não foram atribuídos. |
| `src_pages_MapaColeta.tsx.patch` | outra frente, não portar | Ajustes visuais/ícones da coleta não constam das tarefas. A rodada 3 restringiu o designer à correção textual da LandingPage (`rodada-3/product-designer.md`). |
| `src_pages_PlatformCRM.tsx.patch` | outra frente, não portar | Alteração visual sem tarefa de produto ou engenharia correspondente. |
| `src_pages_PlatformSaude.tsx.patch` | outra frente, não portar | Alteração visual sem tarefa de produto ou engenharia correspondente. |
| `src_pages_PortalPaciente.tsx.patch` | outra frente, não portar | Acrescenta pré-consulta, PDF de atestado e mudanças de sessão. A rodada 3 do backend alterou acesso no servidor e declarou que não alterou o frontend (`rodada-3/backend-developer.md`); essas adições não fazem parte da tarefa atribuída. |
| `src_pages_Prescricoes.tsx.patch` | outra frente, não portar | Ajustes cosméticos e de tamanho de texto; sem tarefa correspondente. |

## Arquivos alterados nesta triagem

- `src/components/whatsapp/types.ts`: duas descrições alinhadas ao fluxo de identificação da rodada 1.
- `docs/time/porte/TRIAGEM.md`: decisões acima.
- `docs/time/rodada-4/codex-triagem.md`: resumo e evidências.

## Evidência e verificação

- `Get-ChildItem docs/time/porte/*.patch`: inventário dos patches; 24 patches fora das atribuições dos demais agentes.
- `rg -n 'COOKIE_CONSENT_EVENT|elolab:cookie-consent' src`: confirmou o evento e seu consumidor já presentes no checkout atual.
- `git diff -- src/components/whatsapp/types.ts`: confirmou que só as duas descrições foram alteradas neste arquivo.
- `git diff --check -- src/components/whatsapp/types.ts`: concluiu sem apontar erros de whitespace.
- Não rodei teste: a única mudança de código é texto estático, sem lógica executável alterada.
