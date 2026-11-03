# Guia do administrador

Você configura a clínica, cuida da equipe e acompanha o funcionamento. O administrador acessa quase todas as telas da clínica. Veja também os guias de [recepção](recepcao.md), [médico](medico.md), [enfermagem](enfermagem.md), [laboratório](laboratorio.md) e [financeiro](financeiro.md).

## Configuração inicial

1. Abra **Configurações > Primeiros passos** (`Prepare sua clínica para atender`). A tela mostra o que falta e o progresso sobe conforme você cadastra.
2. **Equipe e acessos**: abra a equipe e convide funcionários e médicos.
3. **Horários**: informe em quais dias e horários cada médico atende.
4. **Serviços**: crie ao menos um tipo de consulta ativo, com duração e valor.
5. **WhatsApp e atendente de IA** são opcionais e dependem do plano.
6. **Primeira agenda**: crie um agendamento para testar o fluxo completo.

Há também o **Tour do EloLab** (Boas-vindas), que apresenta o sistema.

## Dados da clínica

Abra **Configurações > Dados da clínica**. A tela tem as seções:

- **Clínica**: dados cadastrais.
- **Meu Plano**: plano contratado.
- **Horários e Agenda Online**: horários de atendimento e a agenda online para pacientes.
- **Salas**.
- **Financeiro**.
- **Notificações**.
- **Integrações**.
- **Impressão**.
- **Segurança**.
- **Backup**.
- **Auditoria**: histórico de alterações.

O selo no topo mostra **Salvo na nuvem** ou **Ainda não salvo**. Só considere uma alteração aplicada quando aparecer **Salvo na nuvem**.

> Cuidado: faça mudanças estruturais fora do horário de maior movimento e revise o efeito antes de salvar.

Outras telas de configuração: **Configurações avançadas**, **Integrações disponíveis**, **Interoperabilidade FHIR** e **Plano e assinatura** (**Meu Plano** e faturas).

## Equipe e acessos

1. Abra **Gestão da clínica > Médicos e funcionários**. As abas são **Médicos**, **Funcionários**, **Convites** e **Perfis**.
2. Para adicionar alguém, crie um **convite**. A pessoa recebe o e-mail e cria a própria senha.
3. Escolha o **perfil** correto: administrador, médico, recepção, enfermagem ou financeiro. Dê só o acesso necessário.
4. Para médicos, vincule o usuário ao cadastro de médico e informe a **disponibilidade**.
5. Para um médico que deixou a clínica, use **Inativar médico**. Para os demais, revise o perfil na aba **Funcionários**.

> Cuidado: cada pessoa deve ter a própria conta. Nunca crie um usuário compartilhado.

## Portal do paciente e privacidade

- **Pacientes > Acesso ao portal do paciente**: gere um link individual e privado para um paciente. Veja [portal-paciente.md](portal-paciente.md).
- **Pacientes > Privacidade (LGPD)**: atenda pedidos dos titulares dos dados, como a exportação de dados, e registre a confirmação de entrega.
- **Revisar duplicidades** (em Pacientes): revise cadastros repetidos.
- **Ajuda > Acesso assistido pelo suporte**: acesso temporário, aprovado pela clínica e limitado a dados operacionais. As ações ficam registradas em auditoria.

## Acompanhar a clínica

- **Dashboard** e **Indicadores de produtividade**.
- **Relatórios e indicadores > Relatórios**: relatórios por área, com envios agendados.
- **Indicadores da clínica** (endereço `/analytics`): compare períodos e acompanhe tendências.
- **Risco de faltas**: pacientes com maior chance de faltar, para priorizar confirmações.

## Comunicação

- **Mensagens e lembretes a pacientes** e **Automações da clínica** (dependem do plano).
- **Campanhas e NPS**.
- **Chat interno** para a equipe.

## Segurança

- Revise quem tem acesso e com qual perfil, pelo menos uma vez por mês.
- Oriente a equipe a nunca compartilhar senha. A tela **Segurança da Conta** (`/seguranca`) ajuda a revisar a sessão.
- Faça o backup em **Configurações > Backup**, conforme a política da clínica.

## Suporte

Abra **Ajuda > Suporte** para criar um chamado. Descreva o que aconteceu, a tela e o horário. Não coloque dados sensíveis de pacientes no texto.
