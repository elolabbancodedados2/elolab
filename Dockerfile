FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Vite incorpora estas variáveis no bundle durante o build. A chave é a
# publishable/anon (pública); nunca passe SERVICE_ROLE_KEY para esta imagem.
# Padrões públicos de produção (URL e chave anon já estão no site); o Easypanel
# pode sobrescrever via build args.
ARG VITE_SUPABASE_URL=https://api.elolab.com.br
ARG VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImlhdCI6MTc4OTU1NTE0MiwiZXhwIjoyMTA0OTE1MTQyfQ.wTvxTu0DmOI0XHjBskLKSqE9Sw3f1PWkBwX3KIw2LPM
ARG VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN test -n "$VITE_SUPABASE_URL" && \
    test -n "$VITE_SUPABASE_PUBLISHABLE_KEY$VITE_SUPABASE_ANON_KEY" && \
    npm run build

FROM nginx:1.30.5-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/healthz | grep -q '^ok$' || exit 1
