## 13: Design system e UX global (D)

Formato: tipo | arquivo:linha | o que fazer | esforço | banco (quando houver).

1. correção | pdfGenerator.ts:243,381,578,1006 | addHeader sem await → await nas 4 chamadas + teste | P
2. correção | pdfGenerator.ts:193-203 | rodapé só na última página → addFooters "Página i de N" | P
3. correção | ui/table.tsx:49,5-6 | adaptador de celular quebra o Calendar → restringir com :not(.rdp table) / data-mobile-cards="off" | P
4. correção | MobileTabBar.tsx:86,102,89 | bg-primary/7 não existe; stroke sem efeito → ativo preto; weight fill | P
5. correção | usePersonalPreferences.ts:33 | refaz a busca a cada rota; preferências piscam → useQuery + cache local | P
6. correção | SupabaseAuthContext / uiPreferences | preferências continuam depois do logout → limpar em limparDadosLocaisDoUsuario | P
7. correção | Auth.tsx (FormControl) | aria vai para a div, não para o input → FormControl no Input | P
8. correção | Auth.tsx:135,209,250 | histórico duplicado → replace | P
9. correção | Sidebar.tsx:275 | grupo ativo comparado com === → helper itemCorrespondeRota | P
10. correção | pdfReceipt.ts:136-144,58,30 | pop-up bloqueado sem aviso; texto cortado → retornar booleano + toast; splitTextToSize (coordenar com quem cuida do Caixa) | M
11. design | index.html:28-29; index.css:1 | fontes Kanit e Material Symbols sem uso; @import → remover; @fontsource-variable | P
12. design | index.css:281-283 | focus-visible arredonda tudo → outline sem radius | P
13. design | index.css:170,504 | warning e section-label com contraste baixo → --warning-text; tirar /60 | P
14. design | index.css:258-264 | alto contraste azulado → neutro + prefers-contrast | M
15. design | InicioPainel.tsx:19-90 | 77 cores hex → tokens | M
16. design | lucide × phosphor | ícones mistos → aliases + codemod + lint | G
17. design | button.tsx | rounded-full em todo lugar → padronizar rounded-lg | M
18. design | index.css | sem @media print → bloco de impressão global | P
19. design | pdfGenerator.ts | PDFs em azul e verde → lib/pdfTema.ts em grafite | M
20. design | pdfReceipt / receptionTicket | "EloLab" no lugar da clínica → dados da clínica | P
21. design | 4 telas de impressão | modelos de impressão divergentes → lib/impressao.ts | M
22. design | ui/dialog.tsx:74; alert-dialog | rodapé sem gap no celular → gap-2 | P
23. design | input.tsx × button.tsx | alturas diferentes em tablet → alinhar o breakpoint | P
24. design | index.css:275-295,347-383 | smooth com movimento reduzido; hover que sobe → corrigir | P
25. design | index.css:336-440,752-755 | glass e brilhos → superfícies sólidas | M
26. design | index.css; MainLayout; Navbar; tailwind | resto de preview de fonte; fade-in duplicado → limpar | P
27. design | index.css:766-779 × PageHeader | dois estilos de ícone de título; páginas sem PageHeader → igualar + migrar | M
28. design | EmptyState × ActionableEmptyState | dois componentes de estado vazio → um só com variantes | P
29. design | ErrorState.tsx:33,67-70 | título genérico → prop area + compact + copiar detalhes | P
30. design | 320 textos de 8–10 px | → mínimo de 11 px (codemod + lint) | M
31. design | ui/form.tsx:95,123; label | FormMessage sem role=alert; sem "*" → corrigir | P
32. design | Auth.tsx | labels só para leitor de tela; classes avulsas → labels visíveis; size lg | P
33. design | Auth.tsx:364,809 | regras de senha invisíveis → checklist ao vivo | P
34. design | Auth.tsx | sem aviso de Caps Lock → aviso | P
35. design | auth-switch.tsx:13,46 | aba ativa invisível → preto; tablist | P
36. design | Auth.tsx:275-276,207,248,857 | emojis e toasts de login → remover | P
37. design | Auth / index.html / BrandLoadingScreen | três carregamentos diferentes → unificar | P
38. design | NotFound.tsx:15,27,31-35 | gradiente; destino errado → padrão; Início ou Entrar | P
39. design | Sidebar.tsx:322,281-283 | menu recolhido não mostra os itens → Popover lateral | M
40. design | SidebarNavItem.tsx:74-79; Sidebar.tsx:251-252 | contador cinza; versão fixa no código → preto; __APP_VERSION__ | P
41. feature | Sidebar | favoritos no menu | M
42. feature | AbasTelas | fixar aba, fechar outras, reabrir, arrastar | M
43. feature | AbasTelas / routeLabels | agrupar sub-rotas; nome do paciente na aba | M
44. feature | useKeyboardShortcuts | atalhos de ação configuráveis | M
45. feature | GlobalSearch | paleta de comandos + recentes | M
46. feature | sidebarMenu / MobileTabBar | contadores de pendências | M
47. feature | MobileTabBar | barra do celular configurável | P
48. feature | densidade | 3 níveis + prévia + largura do conteúdo | M
49. feature | ui/table | componente DataTable | G
50. feature | Auth.tsx | lembrar o e-mail + contas recentes | P
