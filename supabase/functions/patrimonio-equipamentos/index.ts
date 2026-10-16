import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checarRateLimit } from '../_shared/rateLimit.ts';
import { corsPadrao } from '../_shared/cors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const BUCKET = 'clinic-equipment-documents';
const STAFF = ['admin', 'recepcao', 'enfermagem'];
const EQUIPMENT_CATEGORIES = ['clinical', 'diagnostic', 'it', 'facility', 'other'];
const ORDER_KINDS = ['preventive', 'corrective', 'calibration', 'inspection'];
const ORDER_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const ASSET_STATUSES = ['active', 'maintenance', 'unavailable', 'retired'];
const SAFE_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
const SAFE_OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9._-]{1,120}$/i;
type Obj = Record<string, unknown>;

Deno.serve(async (req) => {
  const cors = { ...corsPadrao(req), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 12_000) return json({ error: 'Requisição inválida' }, 413);
    const body = JSON.parse(raw) as Obj;
    const action = typeof body.action === 'string' ? body.action : '';
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!bearer) return json({ error: 'Acesso não autorizado' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData } = await auth.auth.getUser(bearer);
    const user = authData.user;
    if (!user) return json({ error: 'Acesso não autorizado' }, 401);
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      db.from('profiles').select('clinica_id,ativo').eq('id', user.id).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', user.id),
    ]);
    const clinicId = profile?.clinica_id as string | undefined;
    const roles = (roleRows || []).map((row: { role: string }) => row.role);
    if (!clinicId || profile?.ativo !== true || !roles.some((role: string) => STAFF.includes(role))) return json({ error: 'Acesso não autorizado' }, 403);
    const limited = await checarRateLimit(db, { chave: `clinic-equipment:${clinicId}:${user.id}`, limite: 80, failClosed: true });
    if (limited) return json({ error: 'Muitas operações. Aguarde um minuto.' }, 429);
    const isAdmin = roles.includes('admin');
    const canMaintain = isAdmin || roles.includes('enfermagem');
    const validDate = (value: unknown) => value === null || value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
    const fail = (message: string, status = 400) => json({ error: message }, status);

    if (action === 'list') {
      const [assets, orders, documents, audit] = await Promise.all([
        db.from('clinic_equipment_assets').select('id,room_id,name,category,manufacturer,model,serial_number,asset_tag,acquired_on,warranty_until,calibration_due,maintenance_interval_days,responsible_user_id,status,block_room_when_unavailable,created_at,updated_at').eq('clinic_id', clinicId).order('name').limit(300),
        db.from('clinic_equipment_work_orders').select('id,asset_id,kind,status,priority,title,description,due_on,assigned_to,opened_by,completion_note,completed_at,created_at,updated_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(300),
        db.from('clinic_equipment_documents').select('id,asset_id,file_name,content_type,byte_size,uploaded_by,created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(200),
        db.from('clinic_equipment_audit').select('id,asset_id,work_order_id,document_id,actor_id,action,details,created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(100),
      ]);
      const error = [assets, orders, documents, audit].find((result) => result.error)?.error;
      if (error) throw error;
      const [{ data: rooms }, { data: profiles }] = await Promise.all([
        db.from('salas').select('id,nome,status').eq('clinica_id', clinicId).order('nome').limit(200),
        db.from('profiles').select('id,nome').eq('clinica_id', clinicId).eq('ativo', true).limit(200),
      ]);
      return json({ assets: assets.data || [], orders: orders.data || [], documents: canMaintain ? documents.data || [] : [], audit: audit.data || [], rooms: rooms || [], profiles: profiles || [], canManageAssets: isAdmin, canMaintain, canOpenOrders: true });
    }

    if (action === 'create_asset') {
      if (!isAdmin) return fail('Somente administrador pode cadastrar patrimônio.', 403);
      const asset = body.asset as Obj;
      if (!asset || typeof asset.name !== 'string' || asset.name.trim().length < 2 || asset.name.length > 160 ||
        !EQUIPMENT_CATEGORIES.includes(String(asset.category)) || (asset.room_id !== null && asset.room_id !== undefined && asset.room_id !== '' && (typeof asset.room_id !== 'string' || !UUID.test(asset.room_id))) ||
        !validDate(asset.acquired_on) || !validDate(asset.warranty_until) || !validDate(asset.calibration_due) ||
        (asset.responsible_user_id !== null && asset.responsible_user_id !== undefined && asset.responsible_user_id !== '' && (typeof asset.responsible_user_id !== 'string' || !UUID.test(asset.responsible_user_id))) ||
        typeof asset.block_room_when_unavailable !== 'boolean') return fail('Revise os dados do equipamento.');
      const interval = asset.maintenance_interval_days;
      if (interval !== null && interval !== undefined && (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1 || interval > 3650)) return fail('Intervalo de manutenção inválido.');
      const { data, error } = await db.from('clinic_equipment_assets').insert({
        clinic_id: clinicId, name: asset.name.trim(), category: asset.category,
        manufacturer: typeof asset.manufacturer === 'string' ? asset.manufacturer.trim().slice(0, 120) || null : null,
        model: typeof asset.model === 'string' ? asset.model.trim().slice(0, 120) || null : null,
        serial_number: typeof asset.serial_number === 'string' ? asset.serial_number.trim().slice(0, 120) || null : null,
        asset_tag: typeof asset.asset_tag === 'string' ? asset.asset_tag.trim().slice(0, 80) || null : null,
        room_id: asset.room_id || null, acquired_on: asset.acquired_on || null, warranty_until: asset.warranty_until || null,
        calibration_due: asset.calibration_due || null, maintenance_interval_days: interval || null,
        responsible_user_id: asset.responsible_user_id || null, block_room_when_unavailable: asset.block_room_when_unavailable,
        status: 'active', created_by: user.id, updated_by: user.id,
      }).select('id').single();
      if (error) throw error;
      return json({ assetId: data.id });
    }

    if (action === 'update_asset') {
      if (!canMaintain) return fail('Perfil sem permissão para atualizar o equipamento.', 403);
      const id = body.asset_id;
      const patch = body.patch as Obj;
      if (typeof id !== 'string' || !UUID.test(id) || !patch || typeof body.expected_updated_at !== 'string') return fail('Equipamento inválido.');
      const current = await db.from('clinic_equipment_assets').select('status,updated_at').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data || current.data.updated_at !== body.expected_updated_at) return fail('O equipamento mudou em outra sessão. Atualize e tente novamente.', 409);
      if (patch.status !== undefined && !ASSET_STATUSES.includes(String(patch.status))) return fail('Status inválido.');
      if (patch.calibration_due !== undefined && !validDate(patch.calibration_due)) return fail('Data de calibração inválida.');
      if (patch.status === 'retired') {
        const unresolved = await db.from('clinic_equipment_work_orders').select('id').eq('asset_id', id).eq('clinic_id', clinicId).in('status', ['open', 'in_progress']).limit(1);
        if (unresolved.error) throw unresolved.error;
        if (unresolved.data?.length) return fail('Conclua ou cancele as ordens abertas antes de aposentar o equipamento.');
      }
      const allowed: Obj = {};
      for (const key of ['status', 'calibration_due'] as const) if (patch[key] !== undefined) allowed[key] = patch[key] || null;
      if (Object.keys(allowed).length !== 1) return fail('Informe uma alteração permitida.');
      const { data, error } = await db.from('clinic_equipment_assets').update({ ...allowed, updated_by: user.id })
        .eq('id', id).eq('clinic_id', clinicId).eq('updated_at', body.expected_updated_at).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return fail('O equipamento mudou em outra sessão. Atualize e tente novamente.', 409);
      return json({ ok: true });
    }

    if (action === 'create_order') {
      if (!STAFF.some((role) => roles.includes(role))) return fail('Perfil sem permissão para abrir ordem.', 403);
      const order = body.order as Obj;
      if (!order || typeof order.asset_id !== 'string' || !UUID.test(order.asset_id) || !ORDER_KINDS.includes(String(order.kind)) ||
        typeof order.title !== 'string' || order.title.trim().length < 3 || order.title.length > 160 || !validDate(order.due_on) ||
        !['low', 'normal', 'high', 'urgent'].includes(String(order.priority || 'normal'))) return fail('Revise os dados da ordem de serviço.');
      const { data: asset } = await db.from('clinic_equipment_assets').select('id').eq('id', order.asset_id).eq('clinic_id', clinicId).maybeSingle();
      if (!asset) return fail('Equipamento não encontrado nesta clínica.', 404);
      const { data, error } = await db.from('clinic_equipment_work_orders').insert({
        clinic_id: clinicId, asset_id: order.asset_id, kind: order.kind, status: 'open', priority: order.priority || 'normal',
        title: order.title.trim(), description: typeof order.description === 'string' ? order.description.trim().slice(0, 2000) || null : null,
        due_on: order.due_on || null, assigned_to: typeof order.assigned_to === 'string' && UUID.test(order.assigned_to) ? order.assigned_to : null,
        opened_by: user.id, updated_by: user.id,
      }).select('id').single();
      if (error) throw error;
      return json({ workOrderId: data.id });
    }

    if (action === 'update_order') {
      if (!canMaintain) return fail('Perfil sem permissão para atualizar ordens.', 403);
      const id = body.work_order_id;
      const patch = body.patch as Obj;
      if (typeof id !== 'string' || !UUID.test(id) || !patch || typeof body.expected_updated_at !== 'string') return fail('Ordem inválida.');
      const current = await db.from('clinic_equipment_work_orders').select('status,updated_at').eq('id', id).eq('clinic_id', clinicId).maybeSingle();
      if (current.error) throw current.error;
      if (!current.data || current.data.updated_at !== body.expected_updated_at) return fail('A ordem mudou em outra sessão. Atualize e tente novamente.', 409);
      const transitions: Record<string, string[]> = { open: ['in_progress', 'cancelled'], in_progress: ['open', 'completed', 'cancelled'] };
      if (!transitions[current.data.status]?.includes(String(patch.status))) return fail('Transição de status não permitida.');
      if (patch.status === 'completed' && (typeof patch.completion_note !== 'string' || patch.completion_note.trim().length < 3)) return fail('Registre o serviço executado antes de concluir.');
      const allowed: Obj = { status: patch.status, updated_by: user.id };
      if (patch.status === 'completed') allowed.completion_note = String(patch.completion_note).trim().slice(0, 2000);
      const { data, error } = await db.from('clinic_equipment_work_orders').update(allowed)
        .eq('id', id).eq('clinic_id', clinicId).eq('updated_at', body.expected_updated_at).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return fail('A ordem mudou em outra sessão. Atualize e tente novamente.', 409);
      return json({ ok: true });
    }

    if (action === 'add_document') {
      if (!canMaintain) return fail('Perfil sem permissão para anexar documentos.', 403);
      const { asset_id, storage_path, file_name, content_type, byte_size } = body;
      if (typeof asset_id !== 'string' || !UUID.test(asset_id) || typeof storage_path !== 'string' ||
        !storage_path.startsWith(`${clinicId}/${asset_id}/`) || storage_path.length > 512 ||
        typeof file_name !== 'string' || file_name.trim().length < 1 || file_name.length > 180 ||
        !SAFE_MIME.includes(String(content_type)) || typeof byte_size !== 'number' || byte_size < 1 || byte_size > 10_485_760) return fail('Metadados de documento inválidos.');
      const { data: asset } = await db.from('clinic_equipment_assets').select('id').eq('id', asset_id).eq('clinic_id', clinicId).maybeSingle();
      if (!asset) return fail('Equipamento não encontrado nesta clínica.', 404);
      const objectName = storage_path.slice(`${clinicId}/${asset_id}/`.length);
      if (!SAFE_OBJECT_NAME.test(objectName)) return fail('Caminho de arquivo inválido.');
      const { data: files, error: listError } = await db.storage.from(BUCKET).list(`${clinicId}/${asset_id}`, { limit: 1000, search: objectName });
      if (listError) throw listError;
      const uploadedFile = files?.find((file) => file.name === objectName);
      if (!uploadedFile || Number(uploadedFile.metadata?.size || 0) !== byte_size ||
        (uploadedFile.metadata?.mimetype && uploadedFile.metadata.mimetype !== content_type)) return fail('O arquivo não foi recebido ou não corresponde aos metadados informados.', 400);
      const { data, error } = await db.from('clinic_equipment_documents').insert({
        clinic_id: clinicId, asset_id, storage_path, file_name: file_name.trim(), content_type, byte_size, uploaded_by: user.id,
      }).select('id').single();
      if (error) throw error;
      return json({ documentId: data.id });
    }

    if (action === 'document_url') {
      if (!canMaintain) return fail('Perfil sem permissão para abrir este documento.', 403);
      if (typeof body.document_id !== 'string' || !UUID.test(body.document_id)) return fail('Documento inválido.');
      const { data: document, error } = await db.from('clinic_equipment_documents').select('storage_path').eq('id', body.document_id).eq('clinic_id', clinicId).maybeSingle();
      if (error) throw error;
      if (!document) return fail('Documento não encontrado nesta clínica.', 404);
      const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrl(document.storage_path, 60);
      if (signError) throw signError;
      return json({ url: signed.signedUrl });
    }

    if (action === 'cleanup_upload') {
      if (!canMaintain || typeof body.storage_path !== 'string' ||
        !new RegExp(`^${clinicId}/${UUID_SEGMENT}/${SAFE_OBJECT_NAME.source.slice(1, -1)}$`, 'i').test(body.storage_path)) return fail('Acesso não autorizado.', 403);
      const { data: referenced, error } = await db.from('clinic_equipment_documents').select('id').eq('clinic_id', clinicId).eq('storage_path', body.storage_path).maybeSingle();
      if (error) throw error;
      if (referenced) return fail('O arquivo já está registrado.');
      const { error: removeError } = await db.storage.from(BUCKET).remove([body.storage_path]);
      if (removeError) throw removeError;
      return json({ ok: true });
    }
    return fail('Ação inválida.');
  } catch (error) {
    console.error('Falha no patrimônio de equipamentos:', error instanceof Error ? error.message : 'erro desconhecido');
    return json({ error: 'Não foi possível concluir a operação. Atualize os dados e tente novamente.' }, 500);
  }
});
