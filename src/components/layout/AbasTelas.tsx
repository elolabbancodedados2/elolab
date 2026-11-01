import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Plus, X } from '@/components/icons/elolabIcons';
import type { EloLabIcon } from '@/components/icons/elolabIcons';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getRouteLabel } from '@/config/routeLabels';
import { menuGroups } from '@/config/sidebarMenu';
import { cn } from '@/lib/utils';

// Abas das telas abertas, como no protótipo aprovado em 30/10/2026.
// Cada tela visitada vira uma aba; a lista fica salva no navegador, por usuário.

interface Aba {
  path: string;
  url: string;
}

const LIMITE_ABAS = 8;
const itensMenu = menuGroups.flatMap(grupo => grupo.items);

function rotuloDaTela(path: string) {
  if (path === '/dashboard') return 'Início';
  return getRouteLabel(path);
}

function iconeDaTela(path: string): EloLabIcon {
  const item = itensMenu
    .filter(menu => {
      const base = menu.href.split('?')[0];
      return path === base || path.startsWith(`${base}/`);
    })
    .sort((a, b) => b.href.length - a.href.length)[0];
  return item?.icon ?? FileText;
}

function lerAbas(chave: string): Aba[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(chave) || '[]');
    return Array.isArray(salvo) ? salvo.filter(aba => typeof aba?.path === 'string' && typeof aba?.url === 'string').slice(0, LIMITE_ABAS) : [];
  } catch {
    return [];
  }
}

export function AbasTelas() {
  const { profile } = useSupabaseAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const chave = `elolab_abas_v1_${profile?.id ?? 'anonimo'}`;
  const [abas, setAbas] = useState<Aba[]>(() => lerAbas(chave));
  const atual = location.pathname;

  useEffect(() => {
    setAbas(lerAbas(chave));
  }, [chave]);

  // A tela aberta entra como aba, ou atualiza a URL da aba que já existia.
  useEffect(() => {
    const url = `${location.pathname}${location.search}`;
    setAbas(anteriores => {
      const existente = anteriores.findIndex(aba => aba.path === atual);
      let proximas: Aba[];
      if (existente >= 0) {
        proximas = anteriores.map((aba, indice) => (indice === existente ? { ...aba, url } : aba));
      } else {
        proximas = [...anteriores, { path: atual, url }];
        if (proximas.length > LIMITE_ABAS) proximas = proximas.slice(proximas.length - LIMITE_ABAS);
      }
      try { localStorage.setItem(chave, JSON.stringify(proximas)); } catch { /* armazenamento indisponível: abas valem só nesta sessão */ }
      return proximas;
    });
  }, [atual, location.pathname, location.search, chave]);

  const fechar = (path: string) => {
    const indice = abas.findIndex(aba => aba.path === path);
    const restantes = abas.filter(aba => aba.path !== path);
    setAbas(restantes);
    try { localStorage.setItem(chave, JSON.stringify(restantes)); } catch { /* idem */ }
    if (path === atual) {
      const vizinha = restantes[Math.max(0, indice - 1)];
      navigate(vizinha ? vizinha.url : '/dashboard');
    }
  };

  if (abas.length === 0) return null;

  return (
    <nav aria-label="Telas abertas" className="hidden h-10 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-secondary px-2 lg:flex">
      {abas.map(aba => {
        const Icone = iconeDaTela(aba.path);
        const ativa = aba.path === atual;
        const rotulo = rotuloDaTela(aba.path);
        return (
          <div
            key={aba.path}
            className={cn(
              'group flex h-8 max-w-[220px] shrink-0 items-center gap-2 rounded-t-lg pl-3 pr-1 text-[12.5px] font-medium',
              ativa ? 'bg-background text-foreground shadow-[0_-1px_0_hsl(var(--border))_inset]' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            <button
              type="button"
              onClick={() => navigate(aba.url)}
              aria-current={ativa ? 'page' : undefined}
              className="flex min-w-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <Icone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{rotulo}</span>
            </button>
            <button
              type="button"
              onClick={() => fechar(aba.path)}
              aria-label={`Fechar aba ${rotulo}`}
              className={cn('grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11', ativa ? 'opacity-70' : 'opacity-0 group-hover:opacity-70 focus-visible:opacity-100')}
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        aria-label="Nova aba"
        title="Nova aba"
        className="mb-1 grid h-7 w-7 shrink-0 place-items-center self-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
    </nav>
  );
}
