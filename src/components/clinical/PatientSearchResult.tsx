import type { PacienteResumo } from '@/hooks/useBuscaPacientes';

interface PatientSearchResultProps {
  paciente: PacienteResumo;
  selecionado: boolean;
  detalhe?: string;
  onSelect: (pacienteId: string) => void;
}

export function PatientSearchResult({ paciente, selecionado, detalhe, onSelect }: PatientSearchResultProps) {
  const nome = paciente.nome_social || paciente.nome;

  return (
    <button
      type="button"
      aria-pressed={selecionado}
      onClick={() => onSelect(paciente.id)}
      className={`flex w-full items-center gap-2.5 border-b border-[#e3ebf2] border-l-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#005ecc] ${
        selecionado ? 'border-l-[#005ecc] bg-[#e0ebf2]/65' : 'border-l-transparent hover:bg-[#f4f8fb]'
      }`}
    >
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e0ebf2] text-xs font-semibold text-[#005ecc]">
        {nome.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#0c1f54]">{nome}</span>
        <span className="block truncate text-[10px] text-[#52647b]">
          {detalhe || 'Data de nascimento não informada'}
          {paciente.cpf && ` · ${paciente.cpf}`}
        </span>
      </span>
    </button>
  );
}
