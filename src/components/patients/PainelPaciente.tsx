import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Edit, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PatientPhoto } from '@/components/clinical';

// Painel lateral do protótipo aprovado em 30/10/2026: resumo do paciente sem sair da lista.
interface Props {
  paciente: any;
  idade: number;
  convenio: string;
  podeEditar: boolean;
  onView: (paciente: any) => void;
  onEdit: (paciente: any) => void;
}

function cpfMascarado(cpf: string | null | undefined) {
  const digitos = String(cpf ?? '').replace(/\D/g, '');
  return digitos.length === 11 ? `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**` : null;
}

export function PainelPaciente({ paciente, idade, convenio, podeEditar, onView, onEdit }: Props) {
  const navigate = useNavigate();
  const alergias: string[] = Array.isArray(paciente.alergias) ? paciente.alergias.filter(Boolean) : [];
  const cpf = cpfMascarado(paciente.cpf);
  const linhas: Array<[string, string | null]> = [
    ['Convênio', convenio],
    ['Telefone', paciente.telefone || null],
    ['E-mail', paciente.email || null],
    ['CPF', cpf],
  ];

  return (
    <aside aria-label={`Resumo de ${paciente.nome}`} className="sticky top-0 self-start rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <PatientPhoto pacienteId={paciente.id} pacienteNome={paciente.nome} currentPhotoUrl={paciente.foto_url} size="md" editable={false} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{paciente.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {Number.isFinite(idade) && idade >= 0 ? `${idade} anos` : 'Idade não informada'}
            {paciente.ativo === false && <Badge variant="secondary" className="ml-2 text-[10px]">Inativo</Badge>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        {paciente.ativo !== false && (
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/agenda/nova', { state: { initial: { paciente_id: paciente.id }, returnTo: '/agenda' } })}>
            <CalendarPlus aria-hidden="true" className="h-4 w-4" /> Agendar
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onView(paciente)}>
          <Eye aria-hidden="true" className="h-4 w-4" /> Abrir ficha
        </Button>
        {podeEditar && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(paciente)}>
            <Edit aria-hidden="true" className="h-4 w-4" /> Editar
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[88px_1fr] gap-y-1 p-4 text-sm">
        <dt className="py-1 text-muted-foreground">Alergias</dt>
        <dd className={alergias.length ? 'py-1 font-medium text-destructive' : 'py-1 text-muted-foreground'}>
          {alergias.length ? alergias.join(', ') : 'Nenhuma informada'}
        </dd>
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="py-1 text-muted-foreground">{rotulo}</dt>
            <dd className={valor ? 'min-w-0 truncate py-1 tabular-nums' : 'py-1 text-muted-foreground'}>{valor ?? 'Não informado'}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
