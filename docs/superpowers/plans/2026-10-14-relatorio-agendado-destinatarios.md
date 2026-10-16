# Plano: agendamento seguro de relatórios

## Objetivo
Só permitir agendar depois de confirmar o fuso `America/Sao_Paulo`, escolher membros ativos da clínica com papel compatível com a fonte e confirmar que o canal Brevo está configurado. Revalidar perfis e papéis no runner antes de qualquer envio para proteger agendas antigas ou adulteradas.

## Etapas
1. Adicionar contratos de regressão para preflight autenticado, seleção de destinatários autorizados, confirmação explícita do fuso e revalidação server-side.
2. Implementar ação de preflight no `scheduled-reports-runner`, retornando apenas estado de configuração e perfis autorizados da clínica para a fonte escolhida.
3. Trocar entrada de e-mails livres por seleção dos perfis autorizados; exigir confirmação do fuso e bloquear salvamento enquanto canal/lista não estiverem válidos.
4. Revalidar todos os destinatários imediatamente antes de enviar e-mail; rejeitar destinatários inativos, fora da clínica ou sem papel elegível.
5. Validar contrato, jornada E2E sintética, TypeScript, build, lint e verificações de segurança; documentar evidências e commit.

## Limites
- Não enviar mensagens reais nem acessar credenciais.
- Não alterar financeiro de pacientes ou cobrança de planos.
- Não aplicar migrations nem fazer deploy nesta etapa.
- Usar somente dados sintéticos nas verificações.

## Resultado

Implementado e validado: preflight consulta o estado real do Brevo sem enviar e-mail; seleção server-side é limitada por clínica, conta ativa e papéis permitidos; destinatários são revalidados antes do envio; agendamento exige confirmação explícita do fuso. Evidências: Vitest 6/6, Playwright sintético 3/3, TypeScript, build, Deno check, ESLint sem erros e quatro verificações do repositório aprovadas. Nenhuma migração ou deploy nesta etapa.
