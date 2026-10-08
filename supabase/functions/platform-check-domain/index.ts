import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';

const reply = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  const headers = { ...corsPadrao(req), 'Content-Type': 'application/json' };
  const send = (body: unknown, status = 200) => reply(body, status, headers);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return send({ error: 'Método não permitido' }, 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await admin.auth.getUser(token);
    if (!auth.user) return send({ error: 'Não autenticado' }, 401);

    const { data: platformAdmin, error: adminError } = await admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', auth.user.id)
      .eq('ativo', true)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!platformAdmin) return send({ error: 'Acesso restrito' }, 403);

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return send({ error: 'Identificador do domínio inválido' }, 400);
    }

    const { data: domain, error: domainError } = await admin
      .from('platform_domains')
      .select('id, domain, purpose')
      .eq('id', id)
      .single();
    if (domainError || !domain) return send({ error: 'Domínio não encontrado' }, 404);
    if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain.domain)) {
      return send({ error: 'Domínio inválido' }, 400);
    }

    const queryDns = async (name: string, type: string) => {
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error('Falha na consulta DNS');
      const result = await response.json();
      if (result.Status !== undefined && ![0, 3].includes(result.Status)) {
        throw new Error('O resolvedor DNS não conseguiu concluir a consulta');
      }
      return result;
    };

    const [a, txt, mx, dmarc] = await Promise.all([
      queryDns(domain.domain, 'A'),
      queryDns(domain.domain, 'TXT'),
      queryDns(domain.domain, 'MX'),
      queryDns(`_dmarc.${domain.domain}`, 'TXT'),
    ]);
    const txtValues = (txt.Answer || [])
      .filter((item: { type?: number }) => item.type === 16)
      .map((item: { data?: string }) => item.data || '');
    const result = {
      a: (a.Answer || []).some((item: { type?: number }) => item.type === 1),
      mx: (mx.Answer || []).some((item: { type?: number }) => item.type === 15),
      spf: txtValues.some((value: string) => value.toLowerCase().includes('v=spf1')),
      dmarc: (dmarc.Answer || []).some((item: { type?: number; data?: string }) =>
        item.type === 16 && (item.data || '').toLowerCase().includes('v=dmarc1')),
      checked_at: new Date().toISOString(),
    };

    const verified = domain.purpose === 'app' ? result.a : result.mx && result.spf;
    const { error: updateError } = await admin
      .from('platform_domains')
      .update({ dns_result: result, checked_at: result.checked_at, status: verified ? 'verified' : 'error' })
      .eq('id', domain.id);
    if (updateError) throw updateError;
    return send({ success: true, verified, result });
  } catch {
    return send({ error: 'Não foi possível verificar o domínio agora' }, 502);
  }
});
