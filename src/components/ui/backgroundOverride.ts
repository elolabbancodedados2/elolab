/**
 * Remove uma imagem de fundo herdada quando a tela escolhe uma cor própria.
 * Os aliases legados `bg-gradient-*` agora são cores sólidas do design system.
 */
const BACKGROUND_COLOR_CLASS =
  /(?:^|\s)!?bg-(?!\[(?:image|url|linear|radial|conic|length|position|size)|gradient-|none(?:\s|$)|opacity-|clip-|origin-|fixed|local|scroll|repeat|no-repeat|cover|contain|auto|center|top|bottom|left|right|blend-)/;

const OWN_BACKGROUND_IMAGE_CLASS = /(?:^|\s)!?bg-\[(?:image|url|linear|radial|conic)/;

export function overridesBackgroundColor(className: string | null | undefined): boolean {
  if (!className || OWN_BACKGROUND_IMAGE_CLASS.test(className)) return false;
  return BACKGROUND_COLOR_CLASS.test(className);
}
