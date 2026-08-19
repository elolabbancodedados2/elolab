import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Content-Type':'application/json'}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers})
 try{
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'')
  const{data:user,error:userError}=await admin.auth.getUser(token)
  if(userError||!user.user)return reply({error:'Não autenticado'},401)
  const{data:platformAdmin}=await admin.from('platform_admins').select('user_id').eq('user_id',user.user.id).eq('ativo',true).maybeSingle()
  if(!platformAdmin)return reply({error:'Acesso restrito à plataforma'},403)
  const body=await req.json()
  if(body.kind==='notification'){
   const{data,error}=await admin.rpc('platform_retry_notification',{p_id:body.id});if(error)throw error
   await admin.from('audit_log').insert({user_id:user.user.id,action:'update',collection:'notification_queue',record_id:body.id,changes:{action:'retry'}})
   return reply({success:true,requeued:data})
  }
  if(body.kind==='mercadopago'){
   const{data:log,error}=await admin.from('mercadopago_webhook_logs').select('id,payload,processado').eq('id',body.id).single();if(error)throw error
   if(log.processado)return reply({success:true,already_processed:true})
   const secret=Deno.env.get('CRON_SECRET');if(!secret)throw new Error('CRON_SECRET não configurado')
   const response=await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-webhook`,{method:'POST',headers:{'Content-Type':'application/json','x-elolab-internal':secret},body:JSON.stringify(log.payload)})
   const result=await response.json().catch(()=>({}))
   await admin.from('audit_log').insert({user_id:user.user.id,action:'update',collection:'mercadopago_webhook_logs',record_id:body.id,changes:{action:'retry',status:response.status}})
   if(!response.ok)return reply({error:'Falha ao reprocessar webhook',details:result},502)
   return reply({success:true,result})
  }
  return reply({error:'Tipo de trabalho inválido'},400)
 }catch(error){return reply({error:error instanceof Error?error.message:String(error)},500)}
})
