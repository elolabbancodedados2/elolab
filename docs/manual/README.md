# Manual do usuário do EloLab

Este manual explica o EloLab em linguagem simples, para a equipe da clínica e para o paciente. Cada guia mostra o caminho no menu e o passo a passo das tarefas do dia a dia.

## Escolha o seu guia

| Quem é você | Guia |
| --- | --- |
| Recepção | [recepcao.md](recepcao.md) |
| Médico | [medico.md](medico.md) |
| Enfermagem | [enfermagem.md](enfermagem.md) |
| Laboratório (coleta, exames e laudos) | [laboratorio.md](laboratorio.md) |
| Financeiro | [financeiro.md](financeiro.md) |
| Administrador da clínica | [administrador.md](administrador.md) |
| Paciente | [portal-paciente.md](portal-paciente.md) |
| Dúvidas comuns | [perguntas-frequentes.md](perguntas-frequentes.md) |

O EloLab tem cinco perfis de acesso: administrador, médico, recepção, enfermagem e financeiro. Não existe um perfil separado de laboratório. As telas do laboratório são usadas por administrador, médico e enfermagem, e a recepção usa as guias externas.

## Primeiros passos

1. Abra o convite recebido por e-mail (tela **Aceitar convite**) e crie a sua senha. Se esquecer a senha, use **Esqueci minha senha** na tela de entrada.
2. Entre no EloLab com a sua própria conta.
3. Leia o **Dashboard**. Ele mostra atalhos e pendências da sua função.
4. No menu lateral, abra **Ajuda > Treinamento e documentação** e faça os roteiros do seu perfil. Os roteiros só orientam a navegação e não criam nenhum dado.
5. Se precisar de ajuda, abra **Ajuda > Suporte**.

## Como o menu funciona

O menu lateral mostra só o que o seu perfil pode usar. Se uma tela que você precisa não aparece, peça ao administrador para revisar as permissões. Alguns recursos também dependem do plano contratado pela clínica (por exemplo, exames, automações e atendente de IA).

O botão **Ajuda desta tela** mostra um resumo curto do que fazer na tela aberta.

## Regras de ouro

- **Use só a sua conta.** Nunca compartilhe senha nem deixe a sessão aberta em computador de outra pessoa.
- **Confira o paciente antes de registrar.** Veja nome e data de nascimento antes de salvar qualquer dado, principalmente clínico.
- **Cuide da privacidade (LGPD).** Veja só os dados de que precisa para o seu trabalho. Não tire foto de tela nem envie dados de pacientes por aplicativos pessoais.
- **Leia a mensagem depois de salvar.** Se aparecer um erro, o dado pode não ter sido salvo. Tente de novo e, se continuar, abra um chamado no Suporte.
- **Feche o caixa todo dia.** Veja o passo a passo no guia da [recepção](recepcao.md#caixa-diário) ou do [financeiro](financeiro.md#caixa-diário).

## Para quem mantém este manual

Os nomes de telas e botões vêm do código em `src/pages`, de `src/config/sidebarMenu.ts` e de `src/config/routeLabels.ts`. Ao mudar um nome no app, atualize o guia correspondente. Os roteiros dentro do app ficam em `src/lib/treinamentoTutoriais.ts`.
