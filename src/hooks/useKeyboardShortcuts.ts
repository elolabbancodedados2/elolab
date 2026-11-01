import { useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { getFilteredMenuGroups } from '@/config/sidebarMenu';
import { useUserPlan } from '@/hooks/useSubscriptionPlan';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Destino final (sem redirecionamento intermediário). */
  href: string;
  action: () => void;
  description: string;
  category: string;
}

/** Atalhos Alt+tecla. `href` é a rota final, igual à do menu lateral. */
const ATALHOS: ReadonlyArray<{ key: string; href: string; description: string }> = [
  { key: 'h', href: '/dashboard', description: 'Ir para Dashboard' },
  { key: 'p', href: '/pacientes', description: 'Ir para Pacientes' },
  { key: 'a', href: '/agenda', description: 'Ir para Agenda' },
  { key: 'f', href: '/fila', description: 'Ir para Fila' },
  { key: 'r', href: '/prontuarios', description: 'Ir para Prontuários' },
  { key: 'e', href: '/documentos-clinicos', description: 'Ir para Prescrições e documentos' },
  { key: 't', href: '/documentos-clinicos?tab=atestados', description: 'Ir para Atestados' },
  { key: 'x', href: '/exames', description: 'Ir para Exames' },
  { key: 'i', href: '/estoque', description: 'Ir para Estoque' },
  { key: 'c', href: '/financeiro', description: 'Ir para Financeiro' },
  { key: 's', href: '/configuracoes', description: 'Ir para Configurações' },
];

const caminhoBase = (href: string) => href.split('?')[0];

/**
 * Lista dos atalhos disponíveis para quem está logado: só aparecem destinos
 * que o menu lateral oferece para o papel e o plano da pessoa.
 * Exportado para o KeyboardShortcutsDialog sem registrar listeners duplicados.
 */
export function useShortcutsList(): ShortcutConfig[] {
  const navigate = useNavigate();
  const { profile, isAdmin, isSuperAdmin } = useSupabaseAuth();
  const { hasFeature, isLoading: planLoading, isError: planError } = useUserPlan();

  return useMemo(() => {
    const temRecurso = (feature?: string) => !feature || (!planLoading && !planError && hasFeature(feature));
    const permitidos = new Set(
      getFilteredMenuGroups(profile?.roles ?? [], isAdmin(), isSuperAdmin, !!profile?.clinica_id, 'app')
        .filter(group => temRecurso(group.planFeature))
        .flatMap(group => group.items.filter(item => !item.external && temRecurso(item.planFeature)))
        .map(item => caminhoBase(item.href)),
    );
    return ATALHOS
      .filter(atalho => permitidos.has(caminhoBase(atalho.href)))
      .map(atalho => ({
        key: atalho.key,
        alt: true,
        href: atalho.href,
        action: () => navigate(atalho.href),
        description: atalho.description,
        category: 'Navegação',
      }));
  }, [navigate, profile?.roles, profile?.clinica_id, isAdmin, isSuperAdmin, planLoading, planError, hasFeature]);
}

/** Alvo onde a pessoa está digitando ou dentro de um diálogo aberto. */
function deveIgnorar(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]')) return true;
  return Boolean(target.closest('[role="dialog"], [role="alertdialog"]'));
}

/** Compara pela tecla física: no Mac, Option+letra muda `event.key` (ex.: Option+P = "π"). */
function teclaCorresponde(event: KeyboardEvent, key: string): boolean {
  if (event.code) return event.code === `Key${key.toUpperCase()}`;
  return event.key?.toLowerCase() === key.toLowerCase();
}

export function useKeyboardShortcuts() {
  const shortcuts = useShortcutsList();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || deveIgnorar(event.target)) return;

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey);
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

      if (teclaCorresponde(event, shortcut.key) && ctrlMatch && altMatch && shiftMatch) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts };
}

export function getShortcutsByCategory(shortcuts: ShortcutConfig[]) {
  const categories: Record<string, ShortcutConfig[]> = {};

  shortcuts.forEach(shortcut => {
    if (!categories[shortcut.category]) {
      categories[shortcut.category] = [];
    }
    categories[shortcut.category].push(shortcut);
  });

  return categories;
}

export function formatShortcut(shortcut: Pick<ShortcutConfig, 'key' | 'ctrl' | 'alt' | 'shift'>): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}
