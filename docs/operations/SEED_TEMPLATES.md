# Templates de email

Os templates iniciais são criados pelas migrations do Supabase, incluindo
`20260413222424_add_notification_templates.sql`. No ambiente atual, o Supabase
é hospedado na VPS e a aplicação é publicada pelo EasyPanel.

Para editar templates, use **Templates de email** dentro do app. Para conferir
os registros, abra o Supabase Studio da VPS e consulte `notification_templates`.

Não execute os scripts antigos de seed nem reaplique o SQL manualmente: isso
pode criar registros duplicados. Faça alterações estruturais por migrations e
publique o app pelo fluxo do GitHub para o EasyPanel.
