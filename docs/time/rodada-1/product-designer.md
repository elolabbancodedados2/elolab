# Rodada 1 — Product Designer

Data: 27/10/2026. Tarefa: `docs/time/rodada-1/TAREFAS.json`, chave `product-designer`. Nenhum código foi editado.

## O que fiz

1. **`docs/ux/design-system/README.md`**: princípios, estado atual medido, tokens (cor, tipografia, espaço, raio, sombra, movimento, ícones), componentes base, padrões de página, cabeçalho, tabela, formulário, filtros, estados vazio/erro/carregamento/sem permissão/sem conexão, diálogos, notificações, acessibilidade, redação, checklist de revisão e plano de adoção.
2. **`docs/ux/telas/identificacao-paciente.md`**: especificação do cabeçalho de identificação do paciente (nome completo, data de nascimento, idade, alergias, CPF mascarado, convênio), com telas obrigatórias, anatomia nas variantes `pagina` e `dialogo` e no celular, regras de conteúdo, estados, acessibilidade, comparação com o componente que o `frontend-developer` criou nesta rodada, contrato de props, testes de aceite e pendências.
3. Esta execução retomou uma execução interrompida: os dois documentos já existiam e estavam completos. Conferi as evidências de novo e corrigi uma linha da tabela de contraste (ver abaixo).

## Arquivos tocados

- `docs/ux/design-system/README.md` (novo)
- `docs/ux/telas/identificacao-paciente.md` (novo)
- `docs/time/rodada-1/product-designer.md` (este arquivo)

## Evidências (comandos executados em 27/10/2026)

| Verificação | Comando | Resultado |
|---|---|---|
| Hex fixo em `.tsx` | `grep -rEo "#[0-9a-fA-F]{6}\b" src --include=*.tsx \| wc -l` | 1064 |
| Classes de paleta fixa | `grep -rEo "\b(bg\|text\|border)-(red\|blue\|green\|…\|stone)-[0-9]{2,3}" src --include=*.tsx \| wc -l` | 410 |
| Texto de 9, 10 e 11 px | `grep -rEo "text-\[Npx\]" src --include=*.tsx \| wc -l` | 37, 349, 166 |
| Paleta própria na landing | `grep -n "const C = {" src/pages/LandingPage.tsx` | linha 53 |
| Componente do frontend | `grep -n` em `src/components/clinical/IdentificacaoPaciente.tsx` | idade menor que 1 mês aparece como "0 meses" (`:44-46`); não tem `variante`, `erro` nem `aria-live`; convênio vazio aparece como "Particular" (`:145`); CPF com leitura "Mascarado, final NN" (`:138`). Confere com a seção 9 da especificação |
| Contraste dos tokens | script abaixo, com os valores HSL de `src/index.css:114-166` | tabela abaixo |

### Script de contraste (WCAG 2.x, luminância relativa)

```js
const hsl=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));return [f(0),f(8),f(4)]};
const lum=c=>{const [r,g,b]=c.map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b};
const mix=(c,bg,a)=>c.map((v,i)=>v*a+bg[i]*(1-a));
const cr=(a,b)=>{const x=lum(a),y=lum(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
const W=[1,1,1],BG=hsl(203,41,95);
// para cada token: cr(c,W), cr(c,BG), cr(c,mix(c,W,.1))
```

Saída (`node contraste.mjs`):

```
foreground         branco 15.28 bg 13.70 tom10% 12.56
muted-foreground   branco 6.64 bg 5.95 tom10% 5.76
primary            branco 5.97 bg 5.35 tom10% 5.14
brand              branco 4.27 bg 3.83 tom10% 3.75
success            branco 3.55 bg 3.18 tom10% 3.17
destructive        branco 5.24 bg 4.69 tom10% 4.46
warning            branco 2.32 bg 2.08 tom10% 2.14
info               branco 4.81 bg 4.31 tom10% 4.18
input              branco 1.34 bg 1.20 tom10% 1.31
border             branco 1.48 bg 1.33 tom10% 1.43
success-prop       branco 5.96 bg 5.34 tom10% 5.17
destructive-prop   branco 6.47 bg 5.80 tom10% 5.47
warning-text-prop  branco 6.44 bg 5.77 tom10% 5.56
input-prop         branco 3.71 bg 3.32 tom10% 3.33
```

Correção feita nesta execução: a tabela do README atribuía 1,48:1 ao contorno de campo, mas o campo usa `border-input` (`src/components/ui/input.tsx:11`), que mede 1,34:1. A linha foi separada em `input` (reprova 1.4.11) e `border` (decorativo).

## Achados principais

- **P1 (CLIN-QA-012):** identificação do paciente insuficiente onde se grava prontuário e pagamento (`src/pages/Prontuarios.tsx:2069-2082`; diálogo de pagamento em `src/pages/Recepcao.tsx:1511-1545`). Especificação pronta; integração aguarda o fim das alterações de outra frente nessas telas.
- **P2 (CLIN-QA-031):** tokens `success`, `warning`, `brand` e `info` reprovam AA como texto; contorno de campo com 1,34:1 reprova 1.4.11. Propostas de valor no README §3.1.
- **P2 (CLIN-QA-019):** 552 usos de texto de 9 a 11 px.
- **P3:** `ui/input.tsx:11` usa `rounded-xl`; o padrão define `rounded-md` em campos. Regex duplicada e digitada errado em `src/components/ErrorState.tsx:38`.

## Riscos

- As propostas de token mudam a aparência de todas as telas de uma vez. Aplicar numa rodada isolada, com captura antes e depois das 5 telas diárias.
- As contagens de cor fixa dependem do regex; até existir o script versionado (CLIN-QA-031), os números não são comparáveis com o relatório 04 (1.474).
- Distinguir "alergia negada" de "não perguntado" exige campo novo no banco; até lá, o componente trata lista vazia do banco como "não informadas" (especificação §5.3). NÃO VERIFICADO se o banco hoje grava lista vazia quando o paciente nega alergias.
- Ordem entre nome social e nome de registro, e regras de revelação do CPF (LGPD): requer avaliação especializada.

## Próximo dono

- `frontend-developer`: ajustes do componente listados na especificação §9 (variante `dialogo`, `erro`, `aria-live`, idade em dias) e, depois da rodada, integração nas telas de prioridade 1.
- `especialista-dominio-saude`: nome social e identificação de amostra no laboratório.
- `business-analyst` + `database-engineer`: estado de confirmação de alergias.
- `security-engineer` + `backend-developer`: auditoria ao revelar CPF.
- `ux-researcher`: teste com 5 recepcionistas e 5 médicos (especificação §10).
