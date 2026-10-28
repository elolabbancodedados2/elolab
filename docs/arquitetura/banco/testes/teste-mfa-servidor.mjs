// Teste da migration 20261029110000_mfa_obrigatorio_servidor.sql em PGlite,
// com dados sintéticos.
// Uso: instalar @electric-sql/pglite@0.3.15 fora do repositório e executar
// node teste-mfa-servidor.mjs <caminho>/20261029110000_mfa_obrigatorio_servidor.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(process.argv[2], 'utf8');
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const ADM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'; // admin de C1, sem fator
const FAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'; // admin de C1, com fator verificado
const REC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'; // recepção de C1, sem fator
const PLA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'; // plataforma, com fator
const OUT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'; // admin de C2, com fator

const setup = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE auth.mfa_factors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('admin', 'medico', 'recepcao', 'enfermagem', 'financeiro');
CREATE TABLE public.profiles (id uuid PRIMARY KEY, clinica_id uuid);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role public.app_role, UNIQUE (user_id, role));
CREATE TABLE public.platform_admins (user_id uuid PRIMARY KEY, ativo boolean, impersonating_clinica_id uuid, original_clinica_id uuid);
CREATE TABLE public.platform_impersonation_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), platform_admin_id uuid, clinica_id uuid);
CREATE TABLE public.lgpd_deletion_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, reason text);
CREATE TABLE public.employee_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinica_id uuid, email text, status text DEFAULT 'pending');
CREATE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid() AND ativo = true) $$;
CREATE FUNCTION public.is_same_clinica(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT c IS NOT NULL AND c = (SELECT clinica_id FROM public.profiles WHERE id = auth.uid()) $$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Policies atuais simplificadas: admin escreve na própria clínica.
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_invitations, public.user_roles TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
CREATE POLICY convites ON public.employee_invitations FOR ALL TO authenticated
  USING (public.is_same_clinica(clinica_id)) WITH CHECK (public.is_same_clinica(clinica_id));
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY papeis ON public.user_roles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND public.is_same_clinica(p.clinica_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_id AND public.is_same_clinica(p.clinica_id)));
-- RPC SECURITY DEFINER no formato das LGPD: grava o log como dona da função.
CREATE FUNCTION public.anonimizar_sintetico(p_clinica uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_same_clinica(p_clinica) THEN RAISE EXCEPTION 'outra clínica' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.lgpd_deletion_log (clinica_id, reason) VALUES (p_clinica, 'sintetico');
END $$;
REVOKE ALL ON FUNCTION public.anonimizar_sintetico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonimizar_sintetico(uuid) TO authenticated;
INSERT INTO auth.users VALUES ('${ADM}'), ('${FAT}'), ('${REC}'), ('${PLA}'), ('${OUT}');
INSERT INTO auth.mfa_factors (user_id, status) VALUES ('${FAT}', 'verified'), ('${PLA}', 'verified'), ('${OUT}', 'verified'), ('${REC}', 'unverified');
INSERT INTO public.profiles VALUES ('${ADM}', '${C1}'), ('${FAT}', '${C1}'), ('${REC}', '${C1}'), ('${PLA}', '${C1}'), ('${OUT}', '${C2}');
INSERT INTO public.user_roles (user_id, role) VALUES ('${ADM}', 'admin'), ('${FAT}', 'admin'), ('${REC}', 'recepcao'), ('${OUT}', 'admin');
INSERT INTO public.platform_admins VALUES ('${PLA}', true, NULL, NULL);
`;

let falhas = 0;
const ok = (cond, nome, detalhe = '') => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ` (${detalhe})` : ''}`);
  if (!cond) falhas++;
};

const db = new PGlite();
await db.exec(setup);
await db.exec(migration);

async function como(uid, aal, sql, params = [], papel = 'authenticated') {
  try {
    return await db.transaction(async (tx) => {
      if (uid) await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, aal })]);
      await tx.exec(`SET LOCAL ROLE ${papel}`);
      return { rows: (await tx.query(sql, params)).rows };
    });
  } catch (e) {
    return { erro: e.message, codigo: e.code, hint: e.hint };
  }
}
const convite = (uid, aal, clinica = C1) =>
  como(uid, aal, `INSERT INTO public.employee_invitations (clinica_id, email) VALUES ($1, 'sintetico@example.invalid') RETURNING id`, [clinica]);
const negadoMfa = (r) => r.codigo === '42501' && r.hint === 'mfa_necessario';

console.log('--- política desligada (padrão)');
{
  ok((await convite(ADM, 'aal1')).rows?.length === 1, 'admin sem fator em AAL1 cria convite (compatível com produção)');
  const r = await convite(FAT, 'aal1');
  ok(negadoMfa(r), 'admin com fator em AAL1 é negado (CLIN-QA-304)', r.codigo ?? 'permitiu');
  ok((await convite(FAT, 'aal2')).rows?.length === 1, 'admin com fator em AAL2 cria convite');
  ok((await convite(REC, 'aal1')).rows?.length === 1, 'fator não verificado não conta');
  const lgpd1 = await como(FAT, 'aal1', 'SELECT public.anonimizar_sintetico($1)', [C1]);
  ok(negadoMfa(lgpd1), 'RPC SECURITY DEFINER de LGPD em AAL1 com fator é negada', lgpd1.codigo ?? 'permitiu');
  const lgpd2 = await como(FAT, 'aal2', 'SELECT public.anonimizar_sintetico($1)', [C1]);
  ok(!lgpd2.erro, 'RPC de LGPD em AAL2 passa', lgpd2.erro);
  const pa1 = await como(PLA, 'aal1', 'SELECT public.is_platform_admin() AS v');
  const pa2 = await como(PLA, 'aal2', 'SELECT public.is_platform_admin() AS v');
  ok(pa1.rows?.[0].v === false && pa2.rows?.[0].v === true, 'is_platform_admin só vale em AAL2 para plataforma com fator');
  const imp = await como(PLA, 'aal1', 'INSERT INTO public.platform_impersonation_log (platform_admin_id, clinica_id) VALUES ($1, $2)', [PLA, C2], 'postgres');
  ok(negadoMfa(imp), 'início de impersonação em AAL1 é negado', imp.codigo ?? 'permitiu');
  const pap = await como(FAT, 'aal1', `UPDATE public.user_roles SET role = 'financeiro' WHERE user_id = $1`, [REC]);
  ok(negadoMfa(pap), 'troca de papel em AAL1 com fator é negada', pap.codigo ?? 'permitiu');
}

console.log('--- outra clínica negado');
{
  const r = await convite(OUT, 'aal2', C1);
  ok(r.codigo === '42501' && r.hint !== 'mfa_necessario', 'admin de C2 em AAL2 continua sem escrever em C1 (RLS)', r.codigo ?? 'permitiu');
  const l = await como(OUT, 'aal2', 'SELECT public.anonimizar_sintetico($1)', [C1]);
  ok(l.codigo === '42501', 'admin de C2 em AAL2 não anonimiza em C1', l.codigo ?? 'permitiu');
}

console.log('--- anon negado');
{
  for (const f of ['exigir_mfa()', 'mfa_satisfeito()', 'mfa_exigido_para_mim()', 'sessao_aal2()', 'perfil_exige_mfa()']) {
    const r = await como(null, null, `SELECT public.${f}`, [], 'anon');
    ok(r.codigo === '42501', `anon não executa ${f}`, r.codigo ?? 'executou');
  }
  const t = await como(null, null, 'SELECT * FROM public.politica_mfa', [], 'anon');
  ok(t.codigo === '42501', 'anon não lê politica_mfa', t.codigo ?? 'leu');
}

console.log('--- service_role e migrations não são afetados');
{
  const r = await como(null, null, `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'medico')`, [REC], 'service_role');
  ok(!r.erro, 'service_role grava papel sem JWT de usuário', r.erro);
}

console.log('--- ligar a política');
{
  const semAal2 = await como(PLA, 'aal1', 'UPDATE public.politica_mfa SET exigir_perfis_privilegiados = true RETURNING 1');
  ok(semAal2.rows?.length === 0 || negadoMfa(semAal2), 'plataforma em AAL1 não liga a política', semAal2.erro ?? `${semAal2.rows?.length} linha(s)`);
  const adm = await como(FAT, 'aal2', 'UPDATE public.politica_mfa SET exigir_perfis_privilegiados = true RETURNING 1');
  ok(adm.rows?.length === 0, 'admin de clínica não altera a política', adm.erro ?? `${adm.rows?.length} linha(s)`);
  const liga = await como(PLA, 'aal2', 'UPDATE public.politica_mfa SET exigir_perfis_privilegiados = true RETURNING atualizado_por');
  ok(liga.rows?.[0]?.atualizado_por === PLA, 'plataforma em AAL2 liga e fica registrada', liga.erro);
}

console.log('--- política ligada');
{
  const r = await convite(ADM, 'aal1');
  ok(negadoMfa(r), 'admin sem fator em AAL1 passa a ser negado', r.codigo ?? 'permitiu');
  const ex = await como(ADM, 'aal1', 'SELECT public.mfa_exigido_para_mim() AS v');
  ok(ex.rows?.[0].v === true, 'mfa_exigido_para_mim() = true para admin');
  const rec = await como(REC, 'aal1', 'SELECT public.mfa_exigido_para_mim() AS v');
  ok(rec.rows?.[0].v === false, 'mfa_exigido_para_mim() = false para recepção');
  ok((await convite(REC, 'aal1')).rows?.length === 1, 'recepção sem fator segue sem exigência');
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os casos passaram');
process.exit(falhas ? 1 : 0);
