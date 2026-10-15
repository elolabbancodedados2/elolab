# Jornada pelo WhatsApp — plano de implementação

**Objetivo:** completar as sete melhorias aprovadas: agendamento, conversa, informações, cancelamento/remarcação, lembretes, pós-consulta e indicadores.

**Arquitetura:** reaproveitar webhook Evolution, agenda existente, fila de notificações e configurações de automação. Escritas de agenda com confirmação explícita e transação no banco; envios pela fila com deduplicação. Nenhuma dependência nova.

**Restrições:** preservar alterações locais; credenciais privadas; clínica e paciente sempre delimitados; testes externos somente nos contatos autorizados; dados fictícios identificados; produção autorizada pelo responsável.

## Execução

- [ ] Agenda: testar antes de implementar RPC transacional com consumo único da confirmação, validação de expediente/bloqueios/conflitos e vínculo do paciente.
- [ ] Conversa: ferramentas para informações, consultar consultas, cancelar com motivo, remarcar e confirmar presença; respostas curtas, sem Markdown e baseadas no retorno das ferramentas.
- [ ] Automação: confirmação/lembretes e pós-consulta pela fila, configuração por clínica, deduplicação e falhas explícitas.
- [ ] Painel: contagens reais e delimitadas por clínica para consultas da IA, confirmações, faltas e falhas de envio.
- [ ] Integração: testes focados, TypeScript/Deno e suíte; revisar diffs das frentes independentes.
- [ ] Produção: cópia de segurança, migrations novas e publicação seletiva; conferir saúde, permissões e executar cenários fictícios explicitamente identificados.
- [ ] Registrar evidências e limitações dos fluxos que exigem resposta do paciente ou passagem do tempo.

## Casos críticos

1. SIM repetido não cria duas consultas nem executa duas alterações.
2. Outra clínica, outro paciente e confirmação expirada não alteram a agenda.
3. Horário ocupado ou bloqueado depois da oferta deve falhar sem perder a consulta anterior.
4. Cancelamento/remarcação invalidam mensagens antigas da consulta.
5. Falha ou resposta ambígua do provedor não deve gerar reenvio automático duplicado.
