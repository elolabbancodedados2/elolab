import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handlePatientJourney } from '../_shared/patientJourneyHandler.ts';

Deno.serve((req) => handlePatientJourney(req, 'reminders',
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)));
