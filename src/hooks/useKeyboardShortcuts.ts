import { useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
  category: string;
}

// Exportado para uso em UIs de visualização (KeyboardShortcutsDialog)
// sem precisar registrar listeners duplicados.
export function useShortcutsList(): ShortcutConfig[] {
  const navigate = useNavigate();
  return useMemo(() => [
    { key: 'h', alt: true, action: () => navigate('/dashboard'), description: 'Ir para Dashboard', category: 'Navegação' },
    { key: 'p', alt: true, action: () => navigate('/pacientes'), description: 'Ir para Pacientes', category: 'Navegação' },
    { key: 'a', alt: true, action: () => navigate('/agenda'), description: 'Ir para Agenda', category: 'Navegação' },
    { key: 'f', alt: true, action: () => navigate('/fila'), description: 'Ir para Fila', category: 'Navegação' },
    { key: 'r', alt: true, action: () => navigate('/prontuarios'), description: 'Ir para Prontuários', category: 'Navegação' },
    { key: 'e', alt: true, action: () => navigate('/prescricoes'), description: 'Ir para Prescrições', category: 'Navegação' },
    { key: 't', alt: true, action: () => navigate('/atestados'), description: 'Ir para Atestados', category: 'Navegação' },
    { key: 'x', alt: true, action: () => navigate('/exames'), description: 'Ir para Exames', category: 'Navegação' },
    { key: 'i', alt: true, action: () => navigate('/estoque'), description: 'Ir para Estoque', category: 'Navegação' },
    { key: '$', alt: true, action: () => navigate('/financeiro'), description: 'Ir para Financeiro', category: 'Navegação' },
    { key: 's', alt: true, action: () => navigate('/configuracoes'), description: 'Ir para Configurações', category: 'Navegação' },
  ], [navigate]);
}

export function useKeyboardShortcuts() {
  const shortcuts = useShortcutsList();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey);
      const altMatch = shortcut.alt ? event.altKey : !event.altKey;
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

      if (
        event.key.toLowerCase() === shortcut.key.toLowerCase() &&
        ctrlMatch &&
        altMatch &&
        shiftMatch
      ) {
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

export function formatShortcut(shortcut: ShortcutConfig): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join(' + ');
}
