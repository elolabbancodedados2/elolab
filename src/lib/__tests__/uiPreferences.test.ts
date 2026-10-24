import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { applyUIPreferences, resolveStartPage } from '@/lib/uiPreferences';

describe('personal UI accessibility preferences', () => {
  afterEach(() => {
    delete document.documentElement.dataset.density;
    delete document.documentElement.dataset.contrast;
    delete document.documentElement.dataset.textSize;
    delete document.documentElement.dataset.dateFormat;
  });

  it('applies compact density, high contrast and larger text to the application shell', () => {
    applyUIPreferences({ density: 'compact', high_contrast: true, text_size: 'large' });

    expect(document.documentElement).toHaveAttribute('data-density', 'compact');
    expect(document.documentElement).toHaveAttribute('data-contrast', 'high');
    expect(document.documentElement).toHaveAttribute('data-text-size', 'large');
  });

  it('restores the comfortable defaults when no preference is saved', () => {
    applyUIPreferences({});

    expect(document.documentElement).toHaveAttribute('data-density', 'comfortable');
    expect(document.documentElement).toHaveAttribute('data-contrast', 'normal');
    expect(document.documentElement).toHaveAttribute('data-text-size', 'normal');
    expect(document.documentElement).toHaveAttribute('data-date-format', 'DD/MM/YYYY');
  });

  it('applies the selected short date format to shared date formatters', () => {
    applyUIPreferences({ date_format: 'YYYY-MM-DD' });
    expect(document.documentElement).toHaveAttribute('data-date-format', 'YYYY-MM-DD');
  });

  it('compact density also tightens table rows on wider screens without touching mobile cards', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const bloco = css.match(/@media \(min-width: 640px\) \{\s*html\[data-density='compact'\] main :is\(td, th\) \{[^}]*\}/)?.[0];
    expect(bloco).toMatch(/padding-top: 0\.375rem/);
    expect(bloco).toMatch(/padding-bottom: 0\.375rem/);
    expect(bloco).not.toMatch(/height|min-height/);
  });

  it('falls back to the dashboard when a saved start page is outside the role permissions', () => {
    expect(resolveStartPage('/agenda', ['financeiro'])).toBe('/dashboard');
    expect(resolveStartPage('/agenda', ['recepcao'])).toBe('/agenda');
    expect(resolveStartPage('/tarefas', ['financeiro'])).toBe('/tarefas');
  });
});
