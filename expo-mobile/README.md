# EloLab Mobile

App nativo (Expo SDK 58, Expo Router, React Native) para a equipe das clínicas. Usa o mesmo projeto Supabase do EloLab web: mesmas tabelas, RPCs, RLS, papéis e planos. Não há WebView; fluxos que dependem de computador (impressão, upload de arquivos, checkout, exportações) abrem a rota correspondente do web no navegador, indicada na própria tela.

## Configurar

Crie `expo-mobile/.env.local` com a URL e a chave **publishable** do projeto (nunca a `service_role`):

```env
EXPO_PUBLIC_SUPABASE_URL=https://<projeto>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave publishable>
```

Sem essas variáveis o app abre a tela de login informando que não está conectado.

## Rodar

```powershell
cd expo-mobile
npm install
npm start          # Expo Go ou emulador Android (tecla a)
npx tsc --noEmit   # typecheck
npx expo lint      # lint
```

## Estrutura

- `src/app/(auth)` — login, cadastro, recuperação de senha e MFA.
- `src/app/(tabs)` — Início, Agenda, Pacientes, Atendimento e Mais.
- `src/app/modules/<chave>.tsx` — uma tela por item do menu web; `src/navigation/catalog.ts` espelha `src/config/sidebarMenu.ts` (rótulos, papéis, planos e rota web equivalente).
- `src/components/ModuleScreen.tsx` — cabeçalho e guarda de papel/plano de cada módulo (também protege links diretos). A autorização real continua no backend.
- `src/components/ui.tsx` — componentes nativos compartilhados; cores em `src/theme/tokens.ts` (azul da marca, igual ao web).
- `src/lib/useLoad.ts` e `src/lib/format.ts` — carregamento com atualização ao focar e formatação pt-BR.

Não publique nas lojas nem gere builds EAS sem pedido explícito do responsável.
