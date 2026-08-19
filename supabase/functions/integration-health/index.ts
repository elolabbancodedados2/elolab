import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info' }
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})
type Check = { id:string; nome:string; status:'ok'|'warning'|'error'; detalhe:string; latencia_ms?:number }

async function external(id:string,nome:string,url:string,headers:Record<string,string>,configured:boolean):Promise<Check>{
  if(!configured) return {id,nome,status:'error',detalhe:'Credencial não configurada'}
  const start=Date.now(); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),6000)
  try { const res=await fetch(url,{headers,signal:controller.signal}); return {id,nome,status:res.ok?'ok':'error',detalhe:res.ok?'Credencial válida e serviço acessível':`Serviço respondeu HTTP ${res.status}`,latencia_ms:Date.now()-start} }
  catch(e){ return {id,nome,status:'error',detalhe:e instanceof DOMException&&e.name==='AbortError'?'Tempo limite excedido':'Serviço inacessível',latencia_ms:Date.now()-start} }
  finally { clearTimeout(timer) }
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  const auth=req.headers.get('authorization'); if(!auth) return json({error:'Sessão obrigatória'},401)
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userDb=createClient(url,anon,{global:{headers:{Authorization:auth}}}); const service=createClient(url,serviceKey)
  const {data:{user},error:userError}=await userDb.auth.getUser(); if(userError||!user) return json({error:'Sessão inválida'},401)
  const [{data:isAdmin},{data:isPlatformAdmin}]=await Promise.all([
    userDb.rpc('is_admin',{_user_id:user.id}),
    userDb.rpc('is_platform_admin'),
  ])
  if(!isAdmin&&!isPlatformAdmin) return json({error:'Apenas administradores'},403)
  const {data:profile}=await service.from('profiles').select('clinica_id').eq('id',user.id).maybeSingle()
  if(!profile?.clinica_id&&!isPlatformAdmin) return json({error:'Clínica não identificada'},400)

  const brevo=Deno.env.get('BREVO_API_KEY')||'', mp=Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')||'', openai=Deno.env.get('OPENAI_API_KEY')||''
  const evoUrl=(Deno.env.get('EVOLUTION_API_URL')||'').replace(/\/+$/,''), evoKey=Deno.env.get('EVOLUTION_API_KEY')||''
  const checks=await Promise.all([
    external('email','E-mail (Brevo)','https://api.brevo.com/v3/account',{'api-key':brevo},!!brevo),
    external('pagamentos','Mercado Pago','https://api.mercadopago.com/users/me',{Authorization:`Bearer ${mp}`},!!mp),
    external('ia','OpenAI','https://api.openai.com/v1/models',{Authorization:`Bearer ${openai}`},!!openai),
    external('whatsapp_api','Evolution API',`${evoUrl}/instance/fetchInstances`,{apikey:evoKey},!!evoUrl&&!!evoKey),
  ])
  let sessoesQuery=service.from('whatsapp_sessions').select('*',{count:'exact',head:true}).eq('status','connected')
  let filaQuery=service.from('notification_queue').select('*',{count:'exact',head:true}).eq('status','erro')
  if(profile?.clinica_id){ sessoesQuery=sessoesQuery.eq('clinica_id',profile.clinica_id); filaQuery=filaQuery.eq('clinica_id',profile.clinica_id) }
  const [{count:sessoes},{count:errosFila},{data:ultimoBackup}]=await Promise.all([
    sessoesQuery,
    filaQuery,
    service.from('automation_logs').select('created_at,status').eq('tipo','backup').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ])
  checks.push({id:'whatsapp_session',nome:'Sessão WhatsApp',status:(sessoes||0)>0?'ok':'warning',detalhe:(sessoes||0)>0?`${sessoes} sessão(ões) conectada(s)`:'Nenhuma sessão conectada'})
  checks.push({id:'fila',nome:'Fila de comunicações',status:(errosFila||0)>0?'warning':'ok',detalhe:(errosFila||0)>0?`${errosFila} envio(s) com erro`:'Sem erros pendentes'})
  checks.push({id:'backup',nome:'Backup automático',status:ultimoBackup?.status==='sucesso'?'ok':'warning',detalhe:ultimoBackup?`Última execução: ${ultimoBackup.status} em ${ultimoBackup.created_at}`:'Sem execução encontrada'})
  return json({checked_at:new Date().toISOString(),overall:checks.some(c=>c.status==='error')?'error':checks.some(c=>c.status==='warning')?'warning':'ok',checks})
})
