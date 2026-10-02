# EloLab: prontidão para venda como SaaS

Revisão do repositório em 2 de outubro de 2026. Este documento separa recursos encontrados no código de itens que dependem de operação, credenciais ou validação externa.

## Já existe no produto

- Onboarding de clínicas calculado a partir dos dados reais: equipe, horários, serviços, WhatsApp conectado e primeiro agendamento.
- Planos, assinatura recorrente pelo Mercado Pago, período de teste, webhook de cobrança e bloqueio de escrita quando a assinatura vence, preservando leitura e exportação.
- Limites administrativos por clínica para usuários, IA e notificações, além de limites por plano para médicos, recepção e equipe.
- Isolamento por clínica em políticas RLS, autorização de Edge Functions, armazenamento e logs de auditoria.
- Central de suporte com chamados, respostas, prioridade e SLA calculado no banco.
- Monitoramento de integrações e saúde, verificação diária dos backups e histórico operacional.

## Melhorias aplicadas nesta revisão

- Limites de consumo agora falham de forma segura: se o banco não consegue calcular usuários, tokens ou notificações, a operação é interrompida em vez de liberar uso sem limite.
- Convites e aceitação de convites verificam limites no servidor, incluindo médicos e recepção.
- O limite por plano é obtido do vínculo da clínica; quando esse vínculo antigo não existe, a função considera a assinatura vigente do proprietário.
- Se não for possível confirmar uma assinatura ou um limite, a inclusão de equipe é bloqueada com mensagem orientando a regularização.
- A leitura de uso da IA reconhece quando atinge o teto de paginação do banco e bloqueia o consumo em vez de subcontar tokens.

## Pendências para vender com segurança

1. **Cópia externa e restauração:** os backups da aplicação estão no Storage do Supabase da VPS. Configurar destino criptografado fora da VPS, retenção e um teste de restauração antes de depender desse backup contra perda do servidor. Não há credenciais de destino externo configuradas pelo código.
2. **Teste isolado de duas clínicas:** validar RLS e perfis em staging com contas sintéticas dedicadas. Não usar dados reais para testes de escrita. O repositório contém specs E2E; a configuração das contas e do ambiente precisa ser confirmada no CI.
3. **Privacidade e contrato:** revisar Termos e Política com assessoria jurídica. Há referências antigas à hospedagem e à frequência de backup que precisam corresponder à operação atual, além da definição formal dos papéis LGPD e do SLA.
4. **Observabilidade externa:** confirmar um canal fora da VPS para receber alertas de indisponibilidade, falhas de Edge Functions, cobrança e backups incompletos; o monitoramento registrado apenas no próprio banco não cobre perda total da VPS.
5. **Limites e preços comerciais:** confirmar que preço, trial, limites de usuários e recursos exibidos em Planos correspondem ao pacote que será oferecido e ao contrato com cada clínica.

## Critério de liberação comercial

Antes de receber uma clínica nova, confirmar estes itens em ambiente controlado: cadastro e checkout, configuração guiada até o primeiro atendimento, convite e troca de função, cancelamento e vencimento, isolamento entre clínicas, restauração de backup e canal de suporte. Guardar evidência de cada execução sem dados identificáveis de pacientes.
