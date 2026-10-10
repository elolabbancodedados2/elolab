/**
 * Conectar/desconectar integrações da clínica (Configurações → Integrações).
 *
 *   list        → catálogo + status das integrações da clínica (sem segredo)
 *   connect     → grava config pública e segredo CIFRADO
 *   disconnect  → apaga o segredo e marca como desconectada
 *
 * Só admin da clínica. O segredo nunca volta ao navegador: depois de salvo, a
 * tela mostra apenas a dica (••••1234). Para trocar, conecta-se de novo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPadrao } from '../_shared/cors.ts';
import { cifrar, dicaDoSegredo } from '../_shared/integracoes.ts';
import { CATALOGO_INTEGRACOES, integracaoDoCatalogo } from '../_shared/catalogoIntegracoes.ts';

let corsHeaders: Record<string, string> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  corsHeaders = { ...corsPadrao(req) };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const [{ data: profile }, { data: adminRole }] = await Promise.all([
      service.from('profiles').select('clinica_id').eq('id', user.id).maybeSingle(),
      service.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
    ]);
    const clinicaId = (profile as any)?.clinica_id as string | undefined;
    if (!clinicaId) return json({ error: 'Usuário sem clínica associada.' }, 403);
    if (!adminRole) return json({ error: 'Apenas o administrador da clínica gerencia integrações.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'list') {
      const { data, error } = await service.from('integracoes_clinica')
        .select('provedor, referencia_id, status, config, segredo_dica, ultimo_erro, ultimo_teste_em, conectado_em, updated_at')
        .eq('clinica_id', clinicaId);
      if (error) throw error;
      return json({ catalogo: CATALOGO_INTEGRACOES, conexoes: data ?? [] });
    }

    const provedor = String(body.provedor || '');
    const integracao = integracaoDoCatalogo(provedor);
    if (!integracao) return json({ error: 'Integração não disponível.' }, 404);
    if (provedor === 'mercado_pago' && action === 'connect') {
      return json({ error: 'Conecte sua conta pelo fluxo seguro de autorização do Mercado Pago.' }, 400);
    }

    const referenciaId = body.referencia_id ? String(body.referencia_id) : null;
    if (integracao.escopo === 'profissional') {
      if (!referenciaId || !UUID.test(referenciaId)) return json({ error: 'Informe o profissional.' }, 400);
      // O profissional precisa ser da clínica do admin.
      const { data: medico } = await service.from('medicos').select('id').eq('id', referenciaId).eq('clinica_id', clinicaId).maybeSingle();
      if (!medico) return json({ error: 'Profissional não encontrado nesta clínica.' }, 404);
    } else if (referenciaId) {
      return json({ error: 'Esta integração é da clínica, não de um profissional.' }, 400);
    }

    const filtro = (q: any) => (referenciaId ? q.eq('referencia_id', referenciaId) : q.is('referencia_id', null));

    if (action === 'disconnect') {
      const { error } = await filtro(service.from('integracoes_clinica').update({
        status: 'desconectado', segredo_cifrado: null, segredo_dica: null, updated_at: new Date().toISOString(),
      }).eq('clinica_id', clinicaId).eq('provedor', provedor));
      if (error) throw error;
      await service.from('audit_log').insert({
        action: 'update', collection: 'integracoes_clinica', record_id: `${provedor}:${referenciaId ?? 'clinica'}`,
        record_name: `Integração ${integracao.nome} desconectada`, user_id: user.id, clinica_id: clinicaId,
      });
      return json({ success: true });
    }

    if (action === 'connect') {
      const valores = (body.valores ?? {}) as Record<string, unknown>;
      const config: Record<string, string> = {};
      const segredos: Record<string, string> = {};
      for (const campo of integracao.campos) {
        const valor = String(valores[campo.id] ?? '').trim();
        if (campo.obrigatorio && !valor) return json({ error: `Preencha "${campo.rotulo}".` }, 400);
        if (campo.tipo === 'selecao' && valor && !campo.opcoes?.some((o) => o.valor === valor)) {
          return json({ error: `Valor inválido em "${campo.rotulo}".` }, 400);
        }
        if (!valor) continue;
        if (valor.length > 4000) return json({ error: `"${campo.rotulo}" muito longo.` }, 400);
        if (campo.publico) config[campo.id] = valor; else segredos[campo.id] = valor;
      }
      const temSegredo = Object.keys(segredos).length > 0;
      const primeiroSegredo = Object.values(segredos)[0] ?? '';

      const linha = {
        clinica_id: clinicaId,
        provedor,
        referencia_id: referenciaId,
        status: 'conectado',
        config,
        segredo_cifrado: temSegredo ? await cifrar(JSON.stringify(segredos)) : null,
        segredo_dica: temSegredo ? dicaDoSegredo(primeiroSegredo) : null,
        ultimo_erro: null,
        conectado_por: user.id,
        conectado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Upsert manual: o índice único usa coalesce(referencia_id), que o
      // onConflict do PostgREST não alcança.
      const { data: existente, error: erroBusca } = await filtro(service.from('integracoes_clinica').select('id, updated_at')
        .eq('clinica_id', clinicaId).eq('provedor', provedor)).maybeSingle();
      if (erroBusca) throw erroBusca;

      const versaoEsperada = typeof body.versao_esperada === 'string' ? body.versao_esperada : null;
      if (existente && (!versaoEsperada || versaoEsperada !== (existente as any).updated_at)) {
        return json({ error: 'Outra pessoa alterou esta integração. Atualize a tela antes de tentar novamente.' }, 409);
      }
      if (!existente && versaoEsperada) {
        return json({ error: 'Esta integração foi removida. Atualize a tela antes de conectar novamente.' }, 409);
      }

      const { data: salvo, error } = existente
        ? await service.from('integracoes_clinica').update(linha).eq('id', (existente as any).id)
          .eq('updated_at', versaoEsperada).select('id').maybeSingle()
        : await service.from('integracoes_clinica').insert(linha).select('id').maybeSingle();
      if (error?.code === '23505') return json({ error: 'Outra pessoa conectou esta integração. Atualize a tela antes de tentar novamente.' }, 409);
      if (error) throw error;
      if (!salvo) return json({ error: 'Outra pessoa alterou esta integração. Atualize a tela antes de tentar novamente.' }, 409);

      await service.from('audit_log').insert({
        action: 'update', collection: 'integracoes_clinica', record_id: `${provedor}:${referenciaId ?? 'clinica'}`,
        record_name: `Integração ${integracao.nome} conectada`, user_id: user.id, clinica_id: clinicaId,
      });
      return json({ success: true });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (err) {
    console.error('[clinic-integrations]', err);
    const msg = String((err as Error)?.message || '');
    if (msg.includes('INTEGRACOES_CHAVE_CRIPTO')) return json({ error: 'Integrações ainda não habilitadas no servidor. Fale com o suporte.' }, 503);
    return json({ error: 'Não foi possível concluir agora.' }, 500);
  }
});
