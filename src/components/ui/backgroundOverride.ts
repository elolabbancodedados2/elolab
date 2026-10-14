/**
 * Variantes padrão de Button e Badge pintam o fundo com `background-image`
 * (gradiente da marca). Uma classe de cor como `bg-destructive` ou `bg-amber-100`
 * só altera `background-color`, que fica escondida sob o gradiente. Quando a tela
 * define uma cor de fundo própria sem prefixo de estado, o gradiente deve sair.
 */
const BACKGROUND_COLOR_CLASS =
  /(?:^|\s)!?bg-(?!\[(?:image|url|linear|radial|conic|length|position|size)|gradient-|none(?:\s|$)|opacity-|clip-|origin-|fixed|local|scroll|repeat|no-repeat|cover|contain|auto|center|top|bottom|left|right|blend-)/;

const OWN_BACKGROUND_IMAGE_CLASS = /(?:^|\s)!?bg-(?:gradient-|\[(?:image|url|linear|radial|conic))/;

export function overridesBackgroundColor(className: string | null | undefined): boolean {
  if (!className || OWN_BACKGROUND_IMAGE_CLASS.test(className)) return false;
  return BACKGROUND_COLOR_CLASS.test(className);
}
