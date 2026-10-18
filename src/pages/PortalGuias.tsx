import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Loader2, CheckCircle2, AlertCircle, FlaskConical, Plus, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { todaySaoPauloDateOnly } from '@/lib/dateOnly';
import { formatCPF, validateCPF } from '@/lib/formatters';

export default function PortalGuias() {
  const { token } = useParams<{ token: string }>();
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [validationUnavailable, setValidationUnavailable] = useState(false);
  const [validationRetry, setValidationRetry] = useState(0);
  const [clinicaNome, setClinicaNome] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    paciente_nome: '', paciente_cpf: '', paciente_nascimento: '', paciente_telefone: '',
    medico_externo_nome: '', medico_externo_crm: '', medico_externo_uf: '', medico_externo_especialidade: '',
    convenio_nome: '', numero_autorizacao: '', observacoes: '',
  });
  const [exames, setExames] = useState<{ nome: string }[]>([{ nome: '' }]);

  useEffect(() => {
    const controller = new AbortController();
    setValidating(true);
    setValid(false);
    setValidationUnavailable(false);
    (async () => {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-guias-externas`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              // Token no header, não no corpo: body atravessa logs de proxy e
              // CDN; header de autorização é o lugar de credencial.
              'x-portal-token': token || '',
            },
            body: JSON.stringify({ action: 'validate' }),
            signal: controller.signal,
          }
        );
        const json = await resp.json();
        if (resp.ok && json.valid) {
          setValid(true);
          setClinicaNome(json.clinica_nome || '');
        } else if (![400, 401].includes(resp.status)) {
          setValidationUnavailable(true);
        }
      } catch {
        if (!controller.signal.aborted) setValidationUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setValidating(false);
      }
    })();
    return () => controller.abort();
  }, [token, validationRetry]);

  const enviar = async () => {
    if (!form.paciente_nome.trim()) { toast.error('Informe o nome do paciente'); return; }
    if (form.paciente_cpf && !validateCPF(form.paciente_cpf)) {
      toast.error('CPF inválido. Confira os números digitados.');
      return;
    }
    if (form.paciente_nascimento && form.paciente_nascimento > todaySaoPauloDateOnly()) {
      toast.error('A data de nascimento não pode estar no futuro.');
      return;
    }
    const examesValidos = exames.filter((e) => e.nome.trim()).map((e) => ({ nome: e.nome.trim() }));
    if (examesValidos.length === 0) { toast.error('Adicione ao menos um exame'); return; }
    if (examesValidos.length > 50) { toast.error('O limite é de 50 exames por guia.'); return; }

    setSubmitting(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-guias-externas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'x-portal-token': token,
        } as any,
        body: JSON.stringify({ ...form, exames_solicitados: examesValidos }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Erro ao enviar');
      setSuccess(true);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#1080CA]" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="max-w-md w-full rounded-2xl">
          <CardContent className="p-8 text-center space-y-3">
            {validationUnavailable ? (
              <>
                <AlertCircle className="h-12 w-12 text-warning mx-auto" />
                <h2 className="text-xl font-bold">Não foi possível validar o link</h2>
                <p className="text-muted-foreground text-sm">Verifique sua conexão e tente novamente. Se o problema continuar, peça um novo link à clínica.</p>
                <Button onClick={() => setValidationRetry(value => value + 1)} disabled={validating} className="mt-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110">
                  {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Tentar novamente
                </Button>
              </>
            ) : (
              <>
                <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
                <h2 className="text-xl font-bold">Link inválido</h2>
                <p className="text-muted-foreground text-sm">
                  Este link de envio de guias não está ativo ou foi removido. Entre em contato com a clínica para obter um novo.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="animate-in fade-in zoom-in-95 duration-200">
          <Card className="max-w-md w-full rounded-2xl">
            <CardContent className="p-8 text-center space-y-3">
              <CheckCircle2 className="h-14 w-14 text-success mx-auto" />
              <h2 className="text-2xl font-bold">Guia enviada!</h2>
              <p className="text-muted-foreground text-sm">
                A clínica <strong>{clinicaNome}</strong> recebeu sua solicitação. Em breve entrarão em contato para agendar a coleta.
              </p>
              <Button onClick={() => { setSuccess(false); setForm({ paciente_nome:'', paciente_cpf:'', paciente_nascimento:'', paciente_telefone:'', medico_externo_nome:'', medico_externo_crm:'', medico_externo_uf:'', medico_externo_especialidade:'', convenio_nome:'', numero_autorizacao:'', observacoes:'' }); setExames([{ nome: '' }]); }} className="mt-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110">
                Enviar outra guia
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F8FC] py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-gradient-primary shadow-md mb-3">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Envio de Guia para Coleta</h1>
          <p className="text-muted-foreground text-sm mt-1">{clinicaNome}</p>
        </div>

        <fieldset disabled={submitting} aria-busy={submitting} className="space-y-4 border-0 p-0 m-0 min-w-0">
        <Card className="rounded-2xl border-[#DCE6F2]">
          <CardHeader><CardTitle className="text-base">Dados do paciente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nome completo *</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.paciente_nome} onChange={(e) => setForm({ ...form, paciente_nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={form.paciente_cpf} onChange={(e) => setForm({ ...form, paciente_cpf: formatCPF(e.target.value) })} /></div>
              <div><Label>Data nascimento</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" type="date" value={form.paciente_nascimento} onChange={(e) => setForm({ ...form, paciente_nascimento: e.target.value })} /></div>
            </div>
            <div><Label>Telefone (WhatsApp)</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.paciente_telefone} onChange={(e) => setForm({ ...form, paciente_telefone: e.target.value })} /></div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#DCE6F2]">
          <CardHeader><CardTitle className="text-base">Médico solicitante</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nome</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.medico_externo_nome} onChange={(e) => setForm({ ...form, medico_externo_nome: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="col-span-2"><Label>CRM</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.medico_externo_crm} onChange={(e) => setForm({ ...form, medico_externo_crm: e.target.value })} /></div>
              <div><Label>UF</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" maxLength={2} value={form.medico_externo_uf} onChange={(e) => setForm({ ...form, medico_externo_uf: e.target.value.toUpperCase() })} /></div>
            </div>
            <div><Label>Especialidade</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.medico_externo_especialidade} onChange={(e) => setForm({ ...form, medico_externo_especialidade: e.target.value })} /></div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#DCE6F2]">
          <CardHeader><CardTitle className="text-base">Convênio</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Convênio</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.convenio_nome} onChange={(e) => setForm({ ...form, convenio_nome: e.target.value })} placeholder="Particular se não tiver" /></div>
              <div><Label>Nº autorização</Label><Input className="rounded-xl focus-visible:ring-[#1080CA]" value={form.numero_autorizacao} onChange={(e) => setForm({ ...form, numero_autorizacao: e.target.value })} /></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-[#DCE6F2]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4 text-[#1080CA]" /> Exames solicitados *</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setExames((current) => [...current, { nome: '' }])} disabled={exames.length >= 50} className="gap-1.5 rounded-full">
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {exames.map((ex, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="rounded-xl focus-visible:ring-[#1080CA]"
                  value={ex.nome}
                  onChange={(e) => setExames((current) => current.map((x, idx) => idx === i ? { nome: e.target.value } : x))}
                  placeholder={`Exame ${i + 1}`}
                />
                {exames.length > 1 && (
                  <Button aria-label={`Remover exame ${i + 1}`} size="icon" variant="ghost" onClick={() => setExames((current) => current.filter((_, idx) => idx !== i))} className="h-10 w-10 shrink-0 rounded-full">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <div className="pt-2">
              <Label>Observações</Label>
              <Textarea className="rounded-xl focus-visible:ring-[#1080CA]" rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Button size="lg" className="w-full gap-2 rounded-full bg-gradient-primary text-white shadow-[0_4px_12px_rgba(16,128,202,0.35)] hover:brightness-110" onClick={enviar} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Enviar guia
        </Button>

        <p className="text-xs text-center text-muted-foreground pb-4">
          Os dados serão tratados conforme a LGPD pela clínica destinatária.
        </p>
        </fieldset>
      </div>
    </div>
  );
}
