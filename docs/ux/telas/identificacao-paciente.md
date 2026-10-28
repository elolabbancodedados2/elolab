# Identificação do paciente

Especificação de componente. Versão 0.1, de 27/10/2026. Dono: Product Designer. Item: CLIN-QA-012 (origem 401, 402 e 403 do relatório `docs/estrategia/funcoes/04-ux-gtm.md`).

Componente: `src/components/clinical/IdentificacaoPaciente.tsx` (o diagnóstico o chama de `PatientIdentityBar`; o nome em português prevalece).

## 1. Problema

Hoje a identificação nas telas de gravação não permite confirmar o paciente com segurança.

| Tela | Observação | Evidência |
|---|---|---|
| Edição do prontuário | Nome num `Badge` com `text-[10px]`, idade abreviada (`42a`), sem data de nascimento, sem alergias, CPF completo exposto, selo "LGPD" sem função | `src/pages/Prontuarios.tsx:2069-2082` (lido em 27/10/2026) |
| Diálogo "Confirmar Pagamento" da Recepção | Mostra a descrição do lançamento e os valores; nome, nascimento e CPF do paciente não aparecem no trecho lido | `src/pages/Recepcao.tsx:1511-1545` (lido). Se a descrição contém o nome: NÃO VERIFICADO |
| Caixa diário | Relatado pelo diagnóstico | `src/pages/CaixaDiario.tsx:1611` (SÓ RELATADO) |
| Alerta de alergias | Existe como componente separado, em caixa alta e pulsando, só na ficha | `src/components/clinical/AllergyAlert.tsx:19-37`; uso na ficha relatado em `04-ux-gtm.md:26` |

Risco: prontuário, prescrição ou pagamento gravado no paciente errado (gravidade P1; vira P0 se o teste com usuários registrar seleção errada, conforme CLIN-QA-012).

## 2. Objetivo e critério de sucesso

O profissional confirma quem é o paciente com dois identificadores (nome completo e data de nascimento) e vê as alergias antes de gravar, sem rolar e sem abrir outra tela.

Critérios de aceite (de CLIN-QA-012, detalhados):
1. Nas telas da seção 3, nome completo, data de nascimento, idade e alergias aparecem sem rolagem, em 1366 × 768 e em 360 × 640.
2. Nome com no mínimo 16 px em página e 14 px em diálogo, peso 600.
3. CPF aparece como `***.***.***-12`. Revelar o CPF completo gera registro de auditoria (fase 2).
4. Nenhum texto do componente abaixo de 12 px. Contraste AA conferido.
5. O componente não tem animação, degradê ou exclamação.

## 3. Onde é obrigatório

Regra geral: toda tela ou diálogo que **registra, prescreve ou cobra** algo de um paciente específico.

| Contexto | Arquivo | Variante | Prioridade de integração |
|---|---|---|---|
| Edição e criação de prontuário | `src/pages/Prontuarios.tsx` | `dialogo` (substitui a faixa de `:2069-2082`) | 1 |
| Prescrição | `src/pages/Prescricoes.tsx` | `pagina` ou `dialogo` | 1 |
| Confirmar pagamento na Recepção | `src/pages/Recepcao.tsx` (dois diálogos, `:1519` e `:1712`) | `dialogo` | 1 |
| Caixa diário e recepção-caixa | `src/pages/CaixaDiario.tsx`, `src/pages/RecepcaoCaixa.tsx` | `dialogo` | 2 |
| Triagem (sinais vitais, classificação) | `src/pages/Triagem.tsx` | `pagina` | 2 |
| Atendimento a partir da fila | `src/pages/AtendimentoFila.tsx` | `pagina` | 2 |
| Encaminhamento, atestado, retorno, procedimentos do atendimento | `src/components/clinical/EncaminhamentoMedico.tsx`, `ReturnScheduler.tsx`, `ProcedimentosDoAtendimento.tsx` | `dialogo` | 3 |
| Coleta e laudo de laboratório | `src/pages/MapaColeta.tsx`, `src/pages/LaudosLab.tsx` | `pagina` | 3 (validar com o especialista de domínio: no laboratório, a amostra também precisa de identificador próprio) |

Fora do escopo: listas (tabela de pacientes, agenda), onde o CPF já deve vir mascarado, mas a faixa completa não é exigida.

A integração nas telas de prioridade 1 fica para depois da rodada 1, porque `Prontuarios.tsx` e `Recepcao.tsx` têm alterações locais de outra frente.

## 4. Anatomia

### 4.1 Variante `pagina` (largura a partir de 768 px)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Maria Aparecida da Silva Santos                                (16px/600) │
│ Nome social: Mariana Santos                                   (14px)     │
│                                                                           │
│ Data de nascimento   Idade      CPF              Convênio                 │
│ 03/05/1958           68 anos    ***.***.***-12   Unimed · 0012 3456 7890  │
│                                                                           │
│ ⚠ Alergias  [Dipirona] [Penicilina] [Látex]                               │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Variante `dialogo` (logo abaixo do título do diálogo)

```
┌───────────────────────────────────────────────────────────┐
│ Maria Aparecida da Silva Santos              (14px/600)   │
│ 03/05/1958 · 68 anos · CPF ***.***.***-12 · Unimed        │
│ ⚠ Alergias: [Dipirona] [Penicilina] [Látex]               │
└───────────────────────────────────────────────────────────┘
```

Na variante `dialogo` os rótulos "Data de nascimento" e "Idade" ficam implícitos na leitura visual, mas continuam presentes para leitor de tela (`dl` com `dt` em `sr-only`).

### 4.3 Celular (abaixo de 768 px)

Mesma ordem, uma informação por linha: nome; nascimento e idade na mesma linha; alergias; CPF e convênio por último. As alergias nunca são truncadas nem escondidas atrás de "ver mais".

### 4.4 Ordem de leitura e hierarquia

1. Nome completo (identificador 1).
2. Data de nascimento e idade (identificador 2).
3. Alergias.
4. CPF mascarado.
5. Convênio e número da carteirinha (quando a tela cobra ou autoriza).

## 5. Regras de conteúdo

### 5.1 Nome

- Sempre o nome completo, sem abreviar e sem truncar. Se não couber, quebra linha.
- Nome social: exibido na linha de baixo com o rótulo "Nome social:". A ordem (social primeiro ou registro primeiro) **requer avaliação especializada** (`especialista-dominio-saude`, com base nas normas do SUS e do CFM sobre nome social). Até a decisão, vale o comportamento atual do componente: nome de registro em destaque e nome social abaixo.
- Homônimos: quando o backend puder informar que há outro paciente ativo com o mesmo nome na clínica, mostrar o aviso "Existe outro paciente com este nome. Confira a data de nascimento." em `warning`. Depende de consulta nova; fica para a fase 2.

### 5.2 Data de nascimento e idade

- Data no formato `dd/mm/aaaa`, lida como data local (`parseDateOnly`), sem deslocamento de fuso.
- Idade por extenso:

| Faixa | Exemplo |
|---|---|
| Menos de 1 mês | "12 dias" |
| De 1 a 11 meses | "8 meses" |
| De 1 ano em diante | "1 ano", "68 anos" |

  Para menores de 2 anos, "1 ano e 4 meses" pode ser útil na pediatria: validar com o especialista de domínio antes de implementar.
- Data ausente ou inválida: "Não informada" em `text-warning-text` com ícone, porque sem ela o segundo identificador falta. Ação opcional "Completar cadastro" quando o perfil puder editar o paciente.

### 5.3 Alergias

Três estados, sempre com texto. Cor nunca é o único sinal.

| Estado | Condição | Exibição |
|---|---|---|
| Alergias registradas | Lista com itens | Ícone `AlertTriangle` + rótulo "Alergias" + um `Badge` `destructive` por item, 12 px ou mais, sem pulso. Leitor de tela: "Atenção: paciente com alergias registradas." |
| Nenhuma alergia conhecida | Confirmação explícita de que o paciente nega alergias | "Nenhuma alergia conhecida", texto normal |
| Não informadas | Nenhum registro ou nenhuma confirmação | "Alergias não informadas" em `text-warning-text` com ícone. Nas telas de prescrição, o texto acrescenta "Confirme com o paciente antes de prescrever." |

**Atenção ao dado.** A coluna `pacientes.alergias` é `TEXT[]` com padrão `'{}'` (`supabase/migrations/20260131002549_38d940ba-6d0d-41b9-8d62-7a109c9a3841.sql:66`; tipo em `src/integrations/supabase/types.ts:3263`). Uma lista vazia no banco pode significar "nunca perguntado", não "nega alergias". Até existir um campo de confirmação (por exemplo, data e autor da verificação), a tela que integra o componente deve passar `alergias: null` quando a lista vier vazia, para exibir "Alergias não informadas". Proposta de campo para o `database-engineer` e o `business-analyst`, sem decisão nesta rodada. Existe também `alergias_relatadas text` em outra tabela (`supabase/migrations/20260315215735_…sql:8`), cuja relação com `pacientes.alergias` não foi verificada.

O componente não interpreta alergias nem sugere conduta. Interação entre alergia e medicamento prescrito é responsabilidade de `DrugInteractionChecker` e exige protocolo aprovado.

### 5.4 CPF

- Formato mascarado: `***.***.***-12` (só os dois dígitos verificadores). Leitor de tela lê "CPF mascarado, final 12", não os asteriscos.
- CPF ausente ou com quantidade de dígitos diferente de 11: "Não informado".
- **Revelar (fase 2).** Botão `ghost` com ícone de olho e `aria-label="Mostrar CPF completo"`, só para perfis autorizados. Ao clicar, a tela registra a auditoria (`logAudit` em `src/lib/auditTrail.ts:148`, com ação e coleção a definir pelo backend) e só depois mostra o número. O número volta a ser mascarado após 30 segundos, ao trocar de paciente ou ao fechar o diálogo. Se a auditoria falhar, o CPF não é revelado e aparece a mensagem "Não foi possível registrar o acesso. Tente novamente.". Quem pode revelar e por quanto tempo o registro é guardado **requer avaliação especializada** (LGPD).
- Em tela de cobrança, quando a nota ou o recibo exigir o CPF completo, o documento gerado mostra o número; o cabeçalho continua mascarado.

### 5.5 Convênio

- "Particular" quando não houver convênio. Nome do convênio e, em telas de cobrança e autorização, número da carteirinha e validade. Carteirinha vencida aparece em `warning` com "Carteirinha vencida em 10/09/2026".
- Na prescrição e no prontuário o convênio é opcional (prop omitida não exibe o campo).

## 6. Estados do componente

| Estado | Exibição | Efeito na tela que usa |
|---|---|---|
| Carregando | Esqueleto com o mesmo formato (linha do nome e 4 blocos); `aria-busy="true"` | Botão de gravar desabilitado até a identificação carregar |
| Sem paciente | "Nenhum paciente selecionado." | Gravar desabilitado; o formulário pede a seleção do paciente primeiro |
| Erro ao carregar | `ErrorState` compacto: "Não foi possível carregar a identificação do paciente." com "Tentar novamente" | Gravar desabilitado. Não exibir dados parciais de outra consulta em cache |
| Carregado | Seção 4 | Normal |
| Paciente trocado com o diálogo aberto | Os dados mudam e um `aria-live="polite"` anuncia "Paciente alterado para Maria Aparecida da Silva Santos." | Campos digitados para o paciente anterior são descartados com confirmação, nunca reaproveitados em silêncio |

O componente atual (seção 9) cobre "carregando", "sem paciente" e "carregado".

## 7. Comportamento e layout

- Posição: primeiro elemento abaixo do título da página ou do diálogo, antes de qualquer campo.
- Em página com rolagem, a faixa fica fixa no topo da área de conteúdo (`sticky top-0`, fundo `card`, borda inferior `border`) para continuar visível enquanto o formulário rola. Em diálogo, fica fora da área que rola (no mesmo bloco fixo do título).
- Altura máxima sem alergias: 88 px na variante `pagina` e 64 px na `dialogo`. Com muitas alergias, a faixa cresce; não esconder alergias para economizar espaço.
- Superfície: `bg-card`, `border border-border`, `rounded-md`, `px-4 py-3`. Sem sombra colorida, degradê ou fundo da cor de marca.
- O componente só exibe; não edita. Ações (completar cadastro, revelar CPF) são botões explícitos.

## 8. Acessibilidade

- Contêiner `section` com `aria-label="Identificação do paciente"`.
- Pares rótulo-valor em `dl`/`dt`/`dd`.
- O nome não é um heading obrigatório; se a página não tiver outro título de paciente, o nome pode ser `h2`.
- Alergias em `ul` com `aria-label="Alergias registradas"`. Ícone com `aria-hidden="true"` e o aviso em texto para leitor de tela.
- Contraste: nome e valores em `foreground` (15,28:1), rótulos em `muted-foreground` (6,64:1), badge de alergia com texto branco sobre `destructive` (5,24:1 hoje; 6,47:1 com o token proposto). "Não informadas" exige o token `warning-text` proposto no design system (6,44:1); o `text-warning` atual (2,32:1) não pode ser usado.
- Nenhuma animação. Respeita zoom de 200% sem cortar texto (quebra de linha em vez de truncamento).
- Teclado: o componente não tem foco próprio; o botão de revelar CPF (fase 2) entra na ordem de tabulação depois do nome.

## 9. Estado do componente na rodada 1

`src/components/clinical/IdentificacaoPaciente.tsx` foi criado em paralelo pelo `frontend-developer` (lido em 27/10/2026, sem edição minha). Comparação com esta especificação:

| Item | Componente | Especificação | Ação |
|---|---|---|---|
| Nome completo, 16 px, peso 600 | Atende (`text-base font-semibold`) | — | — |
| Nome social abaixo | Atende | Ordem pendente de avaliação | Aguardar especialista |
| Data de nascimento e idade por extenso | Atende; menores de 1 ano em meses | Menos de 1 mês em dias ("12 dias") | Ajustar `descreverIdade` (hoje mostra "0 meses") |
| Data ausente | "Não informada" em texto normal | Em `warning-text` com ícone | Ajustar depois do token |
| Alergias, três estados | Atende o contrato (`null` = não informadas, `[]` = nenhuma conhecida) | "Não informadas" em `warning-text`; texto extra na prescrição | Ajustar depois do token; telas convertem `[]` do banco em `null` (seção 5.3) |
| CPF mascarado e leitura para leitor de tela | Atende (`***.***.***-12`, "Mascarado, final 12") | — | — |
| Revelar CPF com auditoria | Não existe | Fase 2 | Backend define a ação de auditoria |
| Convênio | Texto simples; "Particular" quando vazio | Carteirinha e validade em telas de cobrança | Fase 2 |
| Variante `dialogo` compacta | Não existe | Seção 4.2 | Adicionar prop `variante` |
| Estado de erro | Não existe | Seção 6 | Adicionar prop `erro` e `onTentarNovamente` |
| Anúncio de troca de paciente | Não existe | Seção 6 | Adicionar `aria-live` |
| Fixo no topo | Responsabilidade da tela | Seção 7 | Na integração |

Contrato de props proposto para a próxima versão (ajustes ao que já existe, sem quebrar o uso atual):

```ts
interface IdentificacaoPacienteProps {
  paciente: PacienteIdentificacao | null | undefined;
  variante?: 'pagina' | 'dialogo';        // padrão: 'pagina'
  carregando?: boolean;
  erro?: unknown;                          // exibe ErrorState compacto
  onTentarNovamente?: () => void;
  contexto?: 'registro' | 'prescricao' | 'cobranca'; // ajusta textos (alergias, convênio)
  onRevelarCpf?: () => Promise<string>;    // fase 2: registra auditoria e devolve o CPF
  className?: string;
}
```

## 10. Testes de aceite

Automatizados (Vitest + Testing Library), em `src/components/clinical/__tests__/IdentificacaoPaciente.test.tsx`:
1. Exibe nome completo, data `03/05/1958` e idade "68 anos" para nascimento em 03/05/1958 e data de referência 27/10/2026.
2. Recém-nascido de 12 dias mostra "12 dias"; de 8 meses mostra "8 meses".
3. CPF `123.456.789-12` aparece como `***.***.***-12`, e o texto completo não está no DOM.
4. `alergias: null` mostra "Alergias não informadas"; `[]` mostra "Nenhuma alergia conhecida"; `['Dipirona']` mostra o badge e o aviso para leitor de tela.
5. Carregando: `aria-busy="true"` e nenhum dado de paciente.
6. Nenhum elemento com classe `text-[9px]`, `text-[10px]`, `text-[11px]` ou `animate-pulse`.
7. Sem violações no axe (`vitest-axe` ou equivalente, se houver no projeto).

Manuais (QA, depois da integração):
1. Prontuário em edição a 1366 × 768 e a 360 × 640: nome, nascimento e alergias visíveis sem rolagem.
2. Diálogo de pagamento na Recepção: mesma verificação.
3. Leitura com NVDA: a faixa é anunciada como "Identificação do paciente" e as alergias são lidas.
4. Zoom de 200%: nada cortado.
5. Teste com usuários (UX Research): 5 recepcionistas e 5 médicos confirmam o paciente antes de gravar; qualquer seleção errada reclassifica CLIN-QA-012 como P0.

## 11. Dados de exemplo

Use só dados sintéticos. Exemplo para testes e capturas: "Maria Aparecida da Silva Santos", nascimento 03/05/1958, CPF `123.456.789-12` (fictício), alergias Dipirona, Penicilina e Látex, convênio "Convênio Exemplo".

## 12. Pendências e donos

| Pendência | Dono |
|---|---|
| Ordem entre nome social e nome de registro | Especialista de domínio |
| Campo de confirmação de alergias (distinguir "nega" de "não perguntado") | Business Analyst + Database Engineer |
| Ação de auditoria e perfis que podem revelar o CPF; prazo de guarda (LGPD: requer avaliação especializada) | Security Engineer + Backend |
| Aviso de homônimo | Backend |
| Ajustes do componente (seção 9) e integração nas telas de prioridade 1 | Frontend |
| Token `warning-text` e demais ajustes de contraste | Frontend, conforme `docs/ux/design-system/README.md` §3.1 |
| Teste com usuários | UX Research |
