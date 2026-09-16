FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Vite incorpora estas variáveis no bundle durante o build. A chave é a
# publishable/anon (pública); nunca passe SERVICE_ROLE_KEY para esta imagem.
ARG VITE_SUPABASE_URL=https://gebygucrpipaufrlyqqj.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlYnlndWNycGlwYXVmcmx5cXFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTQ2ODAsImV4cCI6MjA4NTM5MDY4MH0.WURCBXjBiAZpk-Qyb3SMu3XQGVvRG07BuCJSURbmouI
ARG VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN test -n "$VITE_SUPABASE_URL" && \
    test -n "$VITE_SUPABASE_PUBLISHABLE_KEY$VITE_SUPABASE_ANON_KEY" && \
    npm run build

FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz | grep -q '^ok$' || exit 1
