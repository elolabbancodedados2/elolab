# EloLab no Expo Go

Este app Expo abre a versão web atual do EloLab em uma WebView para conferir a interface em um celular. Ele não substitui a aplicação web.

## Abrir no celular

1. No terminal do projeto, inicie o Vite na rede local:

   ```powershell
   npm run dev -- --host 0.0.0.0
   ```

2. Descubra o IPv4 do computador com `ipconfig` e crie `expo-mobile/.env.local`:

   ```env
   EXPO_PUBLIC_WEB_URL=http://192.168.1.10:5173
   ```

   Troque o exemplo pelo IPv4 do computador. O celular e o computador precisam estar na mesma rede Wi-Fi.

3. Em outro terminal:

   ```powershell
   cd expo-mobile
   npm start
   ```

4. Instale o Expo Go no celular e leia o QR code exibido no terminal.

Se o celular não alcançar o endereço, confira se o firewall do computador permite conexões na porta `5173`.
