import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checarRateLimit, clientIp } from '../_shared/rateLimit.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: {...cors,'Content-Type':'application/json'} })
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/\b\d{11,14}\b/g,'[documento]').slice(0,max)

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors})
  if (req.method !== 'POST') return json({error:'Method not allowed'},405)
  const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (await checarRateLimit(db,{chave:`telemetry:${clientIp(req)}`,limite:30,janelaSegundos:60})) return json({error:'rate limit'},429)
  let body: Record<string,unknown>; try { body=await req.json() } catch { return json({error:'JSON inválido'},400) }
  const auth = req.headers.get('authorization')
  let userId: string|null=null; let clinicaId: string|null=null
  if (auth) {
    const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
    const {data:{user}}=await userClient.auth.getUser(); userId=user?.id ?? null
    if(userId){ const {data}=await db.from('profiles').select('clinica_id').eq('id',userId).maybeSingle(); clinicaId=data?.clinica_id ?? null }
  }
  const mensagem=clean(body.mensagem,500); if(!mensagem) return json({error:'mensagem obrigatória'},400)
  const {error}=await db.from('client_error_events').insert({clinica_id:clinicaId,user_id:userId,tipo:clean(body.tipo,40)||'error',mensagem,
    origem:clean(body.origem,300)||null,rota:clean(body.rota,200)||null,release:clean(body.release,100)||null,
    navegador:clean(req.headers.get('user-agent'),300)||null,fingerprint:clean(body.fingerprint,100)||null})
  return error ? json({error:'Falha ao registrar'},500) : json({ok:true},202)
})
