# N3: Qualidade e segurança assistencial

## Auditoria do checkout

- `PlatformIncidentes` e `platform_incidents` são incidentes de disponibilidade da plataforma, exclusivos de superadministradores.
- `CentralSuporte` recebe chamados do produto e não faz investigação de risco assistencial.
- `ClinicalSafetyPanel` exibe alertas de prontuário, alergias e sinais vitais; não registra ocorrências.
- Não existe fluxo clínico de quase incidente, análise de causa, responsável, plano de ação ou acompanhamento.

## Fluxo

1. Admin, médico ou enfermagem relata ocorrência, quase incidente, condição insegura, medicação, queda, infecção, equipamento ou outro risco.
2. O formulário não coleta identificador nem nome do paciente. O texto orienta a não incluir dados identificáveis e registra ação imediata tomada.
3. A identidade do relator fica oculta para revisores por padrão; o relator acompanha apenas seu protocolo e status.
4. Admin da clínica faz triagem, atribui responsável, prazo, análise e ação corretiva; registra transições imutáveis.
5. O relator pode pedir retificação sem editar o texto original. Admin aprova ou recusa; se aprovar, a versão anterior permanece no histórico.
6. Toda listagem, leitura, criação, atualização e decisão de retificação gera trilha de acesso com ator, clínica, registro e ação, sem copiar o relato.

## Segurança

- Função Edge verifica JWT, clínica e papel. Tabelas não têm grants diretos para navegador; acesso é via service role.
- Admin vê relatórios da própria clínica. Médico/enfermagem podem criar e consultar apenas os próprios relatos.
- Atualizações internas de revisão ficam visíveis só a admin. Identidade confidencial não é devolvida na lista.
- Proteção otimista por `updated_at`; validação de tipos, datas e tamanhos; sem vínculo a prontuário/paciente.

## Validação

Teste primeiro os contratos da migration e regras puras; depois validar criação, sigilo do relator, revisão/ação corretiva e negação cross-clinic no Chromium sintético. Não escrever em produção nem aplicar migration durante esta etapa.

## Validação local

- Vitest do contrato da migration: 3/3; Deno de validação, escopo de acesso, revisão e retificação versionada: 4/4.
- Playwright Chromium: fluxo sintético 1/1, com relato protegido, revisão, ação corretiva, pedido/aprovação de retificação e versão anterior visível.
- `deno check`, TypeScript, build, ESLint e checks de permissões, colunas, falhas silenciosas e acessibilidade aprovados.
- Parse PostgreSQL: 35 instruções; parser PL/pgSQL: 4 funções.
- Teste do browser usa Edge Function simulada; banco e Edge remotos não foram alterados. Migration e função seguem locais para o deploy final autorizado pelo usuário.
