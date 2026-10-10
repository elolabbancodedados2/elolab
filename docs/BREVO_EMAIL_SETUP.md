# Configuração de e-mail transacional EloLab

Este documento lista a configuração necessária para usar exclusivamente a Brevo nos e-mails de saída. As chaves informadas no chat não devem ser copiadas para arquivos do projeto nem para logs. Insira-as diretamente nos campos secretos do Easypanel e substitua-as por chaves novas depois da configuração, pois foram expostas no histórico da conversa.

## 1. Domínio e remetente na Brevo

Na Brevo, abra **Configurações → Remetentes, domínios e IPs → Domínios** e confira `elolab.com.br`. O domínio deve aparecer autenticado; o remetente `noreply@elolab.com.br` deve estar verificado e habilitado para envio transacional. Se a tela apresentar registros pendentes, copie exatamente os registros TXT/CNAME indicados pela Brevo para a zona DNS do domínio na Hostinger. Não substitua nem remova registros MX existentes. Não invente SPF/DKIM/DMARC: use os valores gerados para esta conta e valide o estado na própria Brevo.

O envio por SMTP para Supabase Auth e o envio pela API HTTP das Edge Functions usam credenciais diferentes: a senha SMTP da Brevo e a chave de API, respectivamente.

## 2. Segredos no Easypanel

No serviço que executa Supabase Edge Functions, configure `BREVO_API_KEY` como segredo (a chave de API da Brevo). Não coloque a chave no serviço do frontend.

No serviço Compose do Supabase, passe ao container `auth` as variáveis abaixo, usando campos secretos para a senha. Use o login SMTP mostrado na tela SMTP & API da Brevo como usuário, a chave SMTP como senha, e mantenha o remetente igual ao endereço já verificado.

```text
GOTRUE_SMTP_HOST=smtp-relay.brevo.com
GOTRUE_SMTP_PORT=587
GOTRUE_SMTP_USER=<login SMTP exibido pela Brevo>
GOTRUE_SMTP_PASS=<chave SMTP da Brevo>
GOTRUE_SMTP_ADMIN_EMAIL=noreply@elolab.com.br
GOTRUE_SMTP_SENDER_NAME=EloLab
```

Não use a chave de API como senha SMTP. Salve/recrie somente o serviço Auth/Edge Functions necessário no Easypanel, preservando os demais valores atuais do Compose.

## 3. Modelos do Supabase Auth

Os modelos estão no diretório estático `public/email/`. Supabase Auth busca o HTML por URL; em instalação auto-hospedada, o serviço Auth precisa alcançar as URLs configuradas. Os caminhos abaixo podem ser usados se o serviço Auth tiver saída HTTPS para o domínio público do frontend:

```text
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://app.elolab.com.br/email/auth-confirmation.html
GOTRUE_MAILER_SUBJECTS_CONFIRMATION=Confirme seu e-mail no EloLab
GOTRUE_MAILER_TEMPLATES_INVITE=https://app.elolab.com.br/email/auth-invite.html
GOTRUE_MAILER_SUBJECTS_INVITE=Convite para o EloLab
GOTRUE_MAILER_TEMPLATES_RECOVERY=https://app.elolab.com.br/email/auth-recovery.html
GOTRUE_MAILER_SUBJECTS_RECOVERY=Redefina sua senha do EloLab
GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://app.elolab.com.br/email/auth-magic-link.html
GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=Seu acesso ao EloLab
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://app.elolab.com.br/email/auth-email-change.html
GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE=Confirme a alteração do seu e-mail
```

Os modelos usam `{{ .ConfirmationURL }}` e oferecem o link visível como alternativa ao botão. A confirmação de endereço e as URLs de recuperação devem continuar autorizadas em `GOTRUE_SITE_URL`/`GOTRUE_URI_ALLOW_LIST` e no frontend (URLs do app EloLab).

A documentação do Supabase informa que os templates são obtidos por HTTP GET pelo serviço Auth e recomenda servir arquivos estáticos numa rede alcançável pelo container. Se o Auth não conseguir buscar `https://app.elolab.com.br`, use um serviço interno dedicado de templates e configure URLs internas como `http://templates-server/auth-confirmation.html`; não monte templates diretamente no container Auth. Depois recrie Auth para carregar as variáveis.

## 4. Checagem de entrega

Depois de configurar e autenticar domínio/remetente, valide na interface da Brevo a autenticação do domínio, o remetente e a ativação de e-mail transacional. No Easypanel, confirme que as variáveis aparecem como configuradas sem revelar valores. Revise os logs de evento/status da Brevo para falhas e bounces. Faça um envio controlado para uma caixa própria somente após o usuário autorizar o teste; o plano gratuito tem limite diário conforme a página vigente da Brevo.

Não configure recebimento de e-mail nem altere MX por este procedimento. Os endereços de suporte e contato do site precisam de caixa postal ou encaminhamento configurado à parte.
