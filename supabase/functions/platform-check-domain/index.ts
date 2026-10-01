import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';

// Atribuído em cada request (reflete a origem permitida). Helpers
// top-level (json/reply) capturam esta variável por closure.
let headers: Record<string, string> = {};

;

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  headers = { ...corsPadrao(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido' }, 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth.user) return reply({ error: 'Não autenticado' }, 401);

    const { data: platformAdmin, error: adminError } = await admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', auth.user.id)
      .eq('ativo', true)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!platformAdmin) return reply({ error: 'Acesso restrito' }, 403);

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return reply({ error: 'Domínio não informado' }, 400);

    const { data: domain, error: domainError } = await admin
      .from('platform_domains')
      .select('id, domain, purpose')
      .eq('id', id)
      .single();
    if (domainError || !domain) return reply({ error: 'Domínio não encontrado' }, 404);
    if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain.domain)) {
      return reply({ error: 'Domínio inválido' }, 400);
    }

    const queryDns = async (type: string) => {
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain.domain)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' } },
      );
      if (!response.ok) throw new Error('Falha na consulta DNS');
      return await response.json();
    };

    const [a, txt, mx] = await Promise.all([queryDns('A'), queryDns('TXT'), queryDns('MX')]);
    const txtValues = (txt.Answer || []).map((item: { data?: string }) => item.data || '');
    const result = {
      a: !!a.Answer?.length,
      mx: !!mx.Answer?.length,
      spf: txtValues.some((value: string) => value.includes('v=spf1')),
      dmarc: false,
      checked_at: new Date().toISOString(),
    };
    const dmarc = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(`_dmarc.${domain.domain}`)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' } },
    );
    if (!dmarc.ok) throw new Error('Falha na consulta DNS');
    const dmarcJson = await dmarc.json();
    result.dmarc = (dmarcJson.Answer || []).some((item: { data?: string }) =>
      (item.data || '').includes('v=DMARC1'));

    const verified = domain.purpose === 'app' ? result.a : result.mx && result.spf;
    const { error: updateError } = await admin
      .from('platform_domains')
      .update({ dns_result: result, checked_at: result.checked_at, status: verified ? 'verified' : 'error' })
      .eq('id', domain.id);
    if (updateError) throw updateError;
    return reply({ success: true, verified, result });
  } catch {
    return reply({ error: 'Não foi possível verificar o domínio agora' }, 502);
  }
});
