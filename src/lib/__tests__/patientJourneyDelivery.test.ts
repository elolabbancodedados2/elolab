import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPhone, notificationHtml } from '../../../supabase/functions/_shared/patientJourneyDelivery';
describe('patient journey delivery boundaries',()=>{
 it('uses the Brazilian country code for national contacts, preserving international digits',()=>{
  expect(normalizeWhatsAppPhone('(11) 96915-3824')).toBe('5511969153824');
  expect(normalizeWhatsAppPhone('+55 (11) 96915-3824')).toBe('5511969153824');
  expect(normalizeWhatsAppPhone('(55) 96915-3824')).toBe('5555969153824');
  expect(()=>normalizeWhatsAppPhone('123')).toThrow();
 });
 it('escapes patient controlled content in plain journey emails while preserving custom legacy HTML',()=>{
  expect(notificationHtml('<img src=x> & paciente\nOlá',true)).toBe('&lt;img src=x&gt; &amp; paciente<br>Olá');
  expect(notificationHtml('<b>Modelo</b>',false)).toBe('<b>Modelo</b>');
 });
});
