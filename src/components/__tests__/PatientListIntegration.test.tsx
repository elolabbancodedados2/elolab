import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';

describe('Patient Data Integration (Supabase client + MSW)', () => {
  it('lista pacientes via mock', async () => {
    const { data, error } = await supabase.from('pacientes').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data![0].nome).toBe('Maria Silva');
  });

  it('lida com erro 500 do servidor', async () => {
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/pacientes`, () => {
        return HttpResponse.json(
          { message: 'Internal Server Error' },
          { status: 500 }
        );
      })
    );
    const { data, error } = await supabase.from('pacientes').select('*');
    expect(error).not.toBeNull();
  });

  it('lista médicos via mock', async () => {
    const { data, error } = await supabase.from('medicos').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].crm).toBe('12345');
  });
});
