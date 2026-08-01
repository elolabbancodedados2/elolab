import { Link } from 'react-router-dom';
import { FileText, Cookie, Scale } from 'lucide-react';

/**
 * Navegação entre os documentos legais.
 *
 * Antes cada página linkava para uma ou duas das outras, sem critério: a de
 * Privacidade não citava os Termos, a de Cookies só voltava para Privacidade.
 * Quem procurava um documento específico dependia de sorte ou de voltar para a
 * página inicial — e quem estava logado nem isso, porque o app não tinha link
 * nenhum para elas.
 *
 * Aqui as três se alcançam sempre, de qualquer uma.
 */
const DOCUMENTOS = [
  { para: '/politica-privacidade', texto: 'Política de Privacidade', icone: FileText },
  { para: '/termos-uso', texto: 'Termos de Uso', icone: Scale },
  { para: '/politica-cookies', texto: 'Política de Cookies', icone: Cookie },
];

interface NavegacaoLegalProps {
  /** Rota da página atual, para não oferecer link para ela mesma. */
  atual: string;
}

export function NavegacaoLegal({ atual }: NavegacaoLegalProps) {
  const outros = DOCUMENTOS.filter((d) => d.para !== atual);

  return (
    <nav aria-label="Outros documentos" className="mt-10 border-t pt-6">
      <p className="text-sm font-medium text-foreground mb-3">Documentos relacionados</p>
      <div className="flex flex-col sm:flex-row gap-3">
        {outros.map((d) => (
          <Link
            key={d.para}
            to={d.para}
            className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm hover:bg-muted/50 transition-colors flex-1"
          >
            <d.icone className="h-4 w-4 text-primary shrink-0" />
            {d.texto}
          </Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Para exercer seus direitos sobre os dados — acesso, correção, portabilidade ou exclusão —
        fale com a clínica que o atende ou escreva para{' '}
        <a href="mailto:privacidade@elolab.com.br" className="text-primary hover:underline">
          privacidade@elolab.com.br
        </a>
        .
      </p>
    </nav>
  );
}
