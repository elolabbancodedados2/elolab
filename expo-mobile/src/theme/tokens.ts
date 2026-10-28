// Mirrors the web tokens in src/index.css (brand blue #1080CA on cool white).
export const colors = {
  ink: '#1C1C22',
  muted: '#60606C',
  placeholder: '#9A9AA6',
  primary: '#1080CA',
  primaryDark: '#0C66A3',
  primarySoft: '#E7F2FB',
  deep: '#0B3A5E',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F4F7',
  border: '#E2E6EA',
  success: '#188050',
  successSoft: '#E6F4EC',
  warning: '#B86D07',
  warningSoft: '#FDF1DE',
  danger: '#D32222',
  dangerSoft: '#FDECEC',
  info: '#2563EB',
  infoSoft: '#E8EFFD',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };
export const type = {
  display: { fontSize: 26, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 13, lineHeight: 19 },
  caption: { fontSize: 11, lineHeight: 15 },
};
