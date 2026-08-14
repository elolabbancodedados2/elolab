"""
Prova que a clinica A nao alcanca dados nem a sessao de WhatsApp da clinica B.

COMO RODAR

    SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=...       python scripts/teste-isolamento-clinicas.py

As chaves saem de `supabase projects api-keys --project-ref <ref>`. Nao guarde
nenhuma delas no repositorio.

ATENCAO: roda contra o banco REAL. Cria duas clinicas descartaveis com um
usuario cada, exercita o isolamento e apaga tudo no `finally` — inclusive se
algum teste falhar. Nenhum usuario de teste chega perto de dado de paciente.

Esta e a única correção grave das últimas sessões que continuava sem cobertura
automatizada, porque exige DUAS contas reais em clinicas diferentes — nao dá
para simular com mock.

DESENHO
Cria duas clinicas DESCARTÁVEIS, com um usuário cada. Nenhuma delas tem
paciente real, então o teste exercita o mecanismo de isolamento sem que
qualquer usuário de teste chegue perto de dado clínico de verdade. Tudo e
apagado no final, inclusive se um teste falhar.

O alvo e o `whatsapp-evolution`: ele usa `service_role` (que ignora o RLS), e
antes da correção aceitava o `session_id` que viesse no corpo da requisição sem
conferir de quem era. Quem obtivesse o id de outra clinica pegava o QR Code
dela — ou seja, pareava o WhatsApp da concorrente no próprio celular.
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REF = "gebygucrpipaufrlyqqj"
BASE = f"https://{REF}.supabase.co"
SERVICE = os.environ["SUPABASE_SERVICE_KEY"]
ANON = os.environ["SUPABASE_ANON_KEY"]

MARCA = f"teste-isolamento-{uuid.uuid4().hex[:8]}"


def http(url, dados=None, headers=None, metodo=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    req = urllib.request.Request(
        url, data=corpo,
        headers={"Content-Type": "application/json", "User-Agent": "elolab-teste/1.0", **(headers or {})},
        method=metodo or ("POST" if corpo else "GET"),
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            texto = r.read().decode()
            return r.status, (json.loads(texto) if texto.strip() else None)
    except urllib.error.HTTPError as e:
        texto = e.read().decode()
        try:
            return e.code, json.loads(texto)
        except Exception:
            return e.code, texto


def admin(caminho, dados=None, metodo=None):
    return http(f"{BASE}{caminho}", dados,
                {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}, metodo)


criados = {"users": [], "clinicas": [], "sessoes": []}


def limpar():
    print("\n--- limpeza ---")
    for sid in criados["sessoes"]:
        admin(f"/rest/v1/whatsapp_sessions?id=eq.{sid}", metodo="DELETE")
    for uid in criados["users"]:
        admin(f"/auth/v1/admin/users/{uid}", metodo="DELETE")
    for cid in criados["clinicas"]:
        admin(f"/rest/v1/profiles?clinica_id=eq.{cid}", metodo="DELETE")
        admin(f"/rest/v1/clinicas?id=eq.{cid}", metodo="DELETE")
    st, resto = admin(f"/rest/v1/clinicas?nome=like.*{MARCA}*&select=id")
    print(f"  clinicas de teste restantes: {len(resto) if isinstance(resto, list) else '?'}")


def criar_clinica(sufixo):
    st, r = admin("/rest/v1/clinicas", [{"nome": f"{MARCA}-{sufixo}"}])
    if st not in (200, 201):
        st, r = http(f"{BASE}/rest/v1/clinicas", [{"nome": f"{MARCA}-{sufixo}"}],
                     {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Prefer": "return=representation"})
    cid = r[0]["id"] if isinstance(r, list) and r else None
    if not cid:
        st, r = admin(f"/rest/v1/clinicas?nome=eq.{MARCA}-{sufixo}&select=id")
        cid = r[0]["id"] if isinstance(r, list) and r else None
    criados["clinicas"].append(cid)
    return cid


def criar_usuario(email, senha, clinica_id):
    st, r = admin("/auth/v1/admin/users",
                  {"email": email, "password": senha, "email_confirm": True})
    uid = (r or {}).get("id")
    if not uid:
        raise SystemExit(f"falha ao criar usuario {email}: {st} {r}")
    criados["users"].append(uid)
    # o trigger de signup cria o profile; garantimos a clinica
    http(f"{BASE}/rest/v1/profiles?id=eq.{uid}", {"clinica_id": clinica_id},
         {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}, "PATCH")
    return uid


def entrar(email, senha):
    st, r = http(f"{BASE}/auth/v1/token?grant_type=password",
                 {"email": email, "password": senha}, {"apikey": ANON})
    if st != 200:
        raise SystemExit(f"login falhou para {email}: {st} {r}")
    return r["access_token"]


falhas = []


def checar(nome, condicao, detalhe=""):
    print(("  OK   " if condicao else "  FALHA") + f" {nome}" + (f"  [{detalhe}]" if detalhe and not condicao else ""))
    if not condicao:
        falhas.append(nome)


try:
    print(f"marca: {MARCA}\n--- preparacao ---")
    cid_a = criar_clinica("A")
    cid_b = criar_clinica("B")
    print(f"  clinica A: {cid_a}\n  clinica B: {cid_b}")

    email_a, email_b = f"{MARCA}-a@exemplo.test", f"{MARCA}-b@exemplo.test"
    senha = uuid.uuid4().hex + "Aa1!"
    criar_usuario(email_a, senha, cid_a)
    criar_usuario(email_b, senha, cid_b)

    # Sessão de WhatsApp pertencente à clinica B — o alvo do ataque.
    st, r = http(f"{BASE}/rest/v1/whatsapp_sessions",
                 [{"instance_name": f"{MARCA}-instancia-B", "clinica_id": cid_b, "status": "connected"}],
                 {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}", "Prefer": "return=representation"})
    sessao_b = r[0]["id"] if isinstance(r, list) and r else None
    if not sessao_b:
        raise SystemExit(f"nao criou sessao de B: {st} {r}")
    criados["sessoes"].append(sessao_b)
    print(f"  sessao WhatsApp de B: {sessao_b}")

    token_a = entrar(email_a, senha)
    cab_a = {"apikey": ANON, "Authorization": f"Bearer {token_a}"}

    print("\n--- isolamento de dados (RLS) ---")
    st, r = http(f"{BASE}/rest/v1/clinicas?select=id,nome", None, cab_a)
    ids = {c["id"] for c in r} if isinstance(r, list) else set()
    checar("A nao enxerga a clinica B na tabela clinicas", cid_b not in ids, f"viu {len(ids)} clinicas")

    st, r = http(f"{BASE}/rest/v1/whatsapp_sessions?select=id,clinica_id", None, cab_a)
    vistas = {s["id"] for s in r} if isinstance(r, list) else set()
    checar("A nao lê a sessao de WhatsApp de B", sessao_b not in vistas)

    print("\n--- edge function whatsapp-evolution ---")
    for acao, corpo in [
        ("get_qr_code",   {"action": "get_qr_code", "session_id": sessao_b}),
        ("send_message",  {"action": "send_message", "session_id": sessao_b,
                           "to": "5511999999999", "message": "teste de isolamento"}),
        ("delete_instance", {"action": "delete_instance", "session_id": sessao_b}),
    ]:
        st, r = http(f"{BASE}/functions/v1/whatsapp-evolution", corpo, cab_a)
        checar(f"A nao consegue {acao} na instancia de B", st != 200, f"status {st}")

    print("\n--- a sessao de B sobreviveu? ---")
    st, r = admin(f"/rest/v1/whatsapp_sessions?id=eq.{sessao_b}&select=id")
    checar("a instancia de B continua existindo", isinstance(r, list) and len(r) == 1)

finally:
    limpar()

print()
if falhas:
    print(f"RESULTADO: {len(falhas)} FALHA(S) — {', '.join(falhas)}")
    sys.exit(1)
print("RESULTADO: isolamento entre clinicas confirmado")
