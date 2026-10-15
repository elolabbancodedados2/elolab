import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handlePatientJourney } from '../../../supabase/functions/_shared/patientJourneyHandler';
declare global { var Deno: { env: { get(key: string): string | undefined } }; }
const clinic = '00000000-0000-0000-0000-000000000001';
const id = '00000000-0000-0000-0000-000000000002';
const token = `header.${btoa(JSON.stringify({role:'authenticated',sub:id}))}.signature`;
function db(result: any={data:{enfileirados:2,duplicado:false},error:null}) {
 const calls:any[]=[];
 return {calls, rpc:async(name:string,args:any)=>{calls.push({name,args});return result;},from:(table:string)=>{
  const q:any={select:()=>q,eq:()=>q,in:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='profiles'?{clinica_id:clinic,ativo:true}:{role:'admin'},error:null})};return q;
 }};
}
function req(body:any,cron=false){return new Request('http://localhost',{method:'POST',headers:cron?{'x-cron-secret':'test-only-secret'}:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)});}
beforeEach(()=>vi.stubGlobal('Deno',{env:{get:(key:string)=>key==='CRON_SECRET'?'test-only-secret':undefined}}));
describe('patient journey producers',()=>{
 it('uses caller clinic, ignores injected tenant, and reports queued not delivered',async()=>{
  const client=db(); const res=await handlePatientJourney(req({agendamento_id:id,clinica_id:'other'}),'confirmation',client);
  expect(res.status).toBe(200);const body=await res.json();expect(body.stats.enfileirados).toBe(2);expect(body.message).toContain('fila');
  expect(client.calls).toEqual([{name:'enfileirar_jornada_paciente',args:{p_clinica_id:clinic,p_agendamento_id:id,p_resultado_id:null,p_automation_key:'confirmacao_agendamento'}}]);
 });
 it('rejects unknown automation and malformed IDs before touching queue',async()=>{
  const client=db();expect((await handlePatientJourney(req({automation_key:'cobranca'}),'reminders',client)).status).toBe(400);
  expect((await handlePatientJourney(req({resultado_id:'not-a-uuid'}),'result',client)).status).toBe(400);expect(client.calls).toHaveLength(0);
 });
 it('reports queue failure and missing clinic result without success',async()=>{
  for(const [code,status] of [['P0002',404],['XX000',500]]){
   const res=await handlePatientJourney(req({resultado_id:id}),'result',db({data:null,error:{code,message:'failed'}}));
   expect(res.status).toBe(status);expect((await res.json()).success).toBe(false);
  }
 });
 it('permits cron reminder reconciliation but forbids cron masquerading as result or confirmation user',async()=>{
  const client=db();expect((await handlePatientJourney(req({},true),'reminders',client)).status).toBe(200);
  expect(client.calls[0].args.p_clinica_id).toBeNull();
  expect((await handlePatientJourney(req({resultado_id:id},true),'result',client)).status).toBe(403);
 });
});
