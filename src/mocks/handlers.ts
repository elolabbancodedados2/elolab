import { http, HttpResponse } from 'msw';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';

const mockPacientes = [
  {
    id: '1',
    nome: 'Maria Silva',
    cpf: '12345678901',
    telefone: '11999999999',
    email: 'maria@test.com',
    data_nascimento: '1990-01-15',
    sexo: 'F',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    nome: 'João Santos',
    cpf: '98765432100',
    telefone: '11888888888',
    email: 'joao@test.com',
    data_nascimento: '1985-06-20',
    sexo: 'M',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
];

const mockMedicos = [
  {
    id: '1',
    nome: 'Dr. Carlos Oliveira',
    crm: '12345',
    especialidade: 'Clínica Geral',
    ativo: true,
  },
];

const mockAgendamentos = [
  {
    id: '1',
    paciente_id: '1',
    medico_id: '1',
    data: '2024-06-15',
    hora_inicio: '09:00',
    status: 'agendado',
  },
];

export const handlers = [
  // Pacientes
  http.get(`${SUPABASE_URL}/rest/v1/pacientes`, ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get('select');
    // Support count-only requests
    if (request.headers.get('Prefer')?.includes('count=exact')) {
      return HttpResponse.json(mockPacientes, {
        headers: { 'content-range': `0-${mockPacientes.length - 1}/${mockPacientes.length}` },
      });
    }
    return HttpResponse.json(mockPacientes);
  }),

  http.post(`${SUPABASE_URL}/rest/v1/pacientes`, async ({ request }) => {
    const body = await request.json();
    const newPaciente = { id: crypto.randomUUID(), ...body as object, created_at: new Date().toISOString() };
    return HttpResponse.json([newPaciente], { status: 201 });
  }),

  http.delete(`${SUPABASE_URL}/rest/v1/pacientes`, () => {
    return HttpResponse.json([], { status: 200 });
  }),

  http.patch(`${SUPABASE_URL}/rest/v1/pacientes`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json([body], { status: 200 });
  }),

  // Medicos
  http.get(`${SUPABASE_URL}/rest/v1/medicos`, () => {
    return HttpResponse.json(mockMedicos);
  }),

  // Agendamentos
  http.get(`${SUPABASE_URL}/rest/v1/agendamentos`, () => {
    return HttpResponse.json(mockAgendamentos);
  }),

  // Profiles
  http.get(`${SUPABASE_URL}/rest/v1/profiles`, () => {
    return HttpResponse.json([]);
  }),

  // User roles
  http.get(`${SUPABASE_URL}/rest/v1/user_roles`, () => {
    return HttpResponse.json([]);
  }),

  // Auth endpoints
  http.post(`${SUPABASE_URL}/auth/v1/token`, () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: 'mock-user-id', email: 'test@test.com' },
    });
  }),

  http.get(`${SUPABASE_URL}/auth/v1/user`, () => {
    return HttpResponse.json({ id: 'mock-user-id', email: 'test@test.com' });
  }),
];

export { mockPacientes, mockMedicos, mockAgendamentos };
