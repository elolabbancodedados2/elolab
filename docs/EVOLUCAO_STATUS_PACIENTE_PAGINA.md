# Pacientes — alteração de status em página própria

## Diagnóstico atual

Na lista de pacientes, a inativação e a reativação dependiam de um diálogo com motivo administrativo obrigatório. A operação altera elegibilidade para novos agendamentos e acesso ao portal, e a inativação exige que compromissos ativos/futuros e a fila sejam tratados antes da confirmação. O diálogo comprimia esses efeitos e o caminho de recuperação no contexto da lista.

## Direção de redesign

A tarefa agora tem rota dedicada em `/pacientes/:patientId/status`. A tela apresenta a pessoa, o status atual, o motivo auditável e os efeitos diferentes para inativação e reativação. A operação fica disponível aos perfis `admin` e `recepcao`, correspondendo à autorização anterior. O retorno à lista preserva busca/filtros e devolve o foco à região da listagem.

## Implementação

- `src/pages/PatientStatusPage.tsx`: consulta o paciente no escopo da clínica, apresenta formulário e consequências, mantém o motivo após falhas e protege rascunho não salvo.
- `src/pages/Pacientes.tsx`: a ação da lista navega à nova página; após a conclusão, atualiza as listas e restaura o contexto/foco.
- `src/App.tsx` e `src/config/routeLabels.ts`: rota protegida e rótulo de navegação.
- `tests/patient-status-page.spec.ts`: cobre a inativação, o motivo enviado, a recuperação de conflito operacional e a restrição de perfil.

A RPC `alterar_status_paciente`, seus parâmetros e a função cliente `setPatientActiveStatus` foram preservados. O servidor continua revalidando compromissos e fila durante a operação. Nenhuma regra de negócio, contrato, permissão do backend ou integração foi alterada.

## Validação

- TypeScript: sem erros.
- Playwright: 3/3 cenários; chamadas de escrita foram interceptadas e nenhum registro real foi alterado.
- Vitest relacionado: 10/10.
- Acessibilidade, permissões, falhas silenciosas e colunas do banco: passaram.
- ESLint focal: zero erros; 54 avisos preexistentes de `any` em `Pacientes.tsx`.
- Build de produção: passou.
- Inspeção renderizada: capturas mobile (390 px) e desktop (1440 px) inspecionadas. A ação principal permanece acima da navegação inferior no mobile e não há overflow horizontal.

## Limitações

Os testes exercitam uma clínica sintética e interceptam a RPC. Não foi alterado status de nenhum paciente real. A operação em produção depende dos dados reais e continua sujeita às validações transacionais já existentes.

## Publicação

Publicado em 30/10/2026 no commit `7205376b0434f8ba833551804cc889fd4011c9ed`, imagem `easypanel/elolab/app:deploy-20261030-7205376`, rollback `deploy-20261030-ea619d0`. O container isolado respondeu `/healthz=ok`; os domínios `app.elolab.com.br` e `elolab.com.br` responderam `ok` e publicaram o SHA integral esperado em `/version.json`. O serviço Swarm ficou em 1/1. A fonte anterior está preservada em `/etc/easypanel/projects/elolab/app/code.before-20261030-7205376`. O hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, conferido sem ler ou exibir valores. Nenhuma migration ou escrita em dados de produção foi feita. A porta host-mode teve contenção transitória durante a atualização e convergiu antes da confirmação pública.
