export type UIPreferences = {
  density?: 'comfortable' | 'compact';
  high_contrast?: boolean;
  text_size?: 'normal' | 'large';
  date_format?: 'DD/MM/YYYY' | 'YYYY-MM-DD';
};

export type StartPage = '/dashboard' | '/agenda' | '/tarefas' | '/notificacoes';

export function resolveStartPage(startPage: StartPage | null | undefined, roles: string[]): StartPage {
  if (startPage === '/agenda' && !roles.some(role => ['admin', 'recepcao', 'enfermagem', 'medico'].includes(role))) {
    return '/dashboard';
  }
  return startPage || '/dashboard';
}

export function applyUIPreferences(preferences: UIPreferences) {
  const root = document.documentElement;
  root.dataset.density = preferences.density === 'compact' ? 'compact' : 'comfortable';
  root.dataset.contrast = preferences.high_contrast ? 'high' : 'normal';
  root.dataset.textSize = preferences.text_size === 'large' ? 'large' : 'normal';
  root.dataset.dateFormat = preferences.date_format === 'YYYY-MM-DD' ? 'YYYY-MM-DD' : 'DD/MM/YYYY';
}
