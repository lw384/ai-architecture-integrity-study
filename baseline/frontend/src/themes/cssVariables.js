/**
 * Expose stable application tokens for styles that run outside MUI's styling
 * engine. Values always come from the active MUI theme, so CSS Modules do not
 * need a second token source.
 */
export default function buildCssVariables(theme) {
  const palette = theme.vars?.palette ?? theme.palette;
  const customShadows = theme.vars?.customShadows ?? theme.customShadows;

  return {
    '--app-color-primary': palette.primary.main,
    '--app-color-primary-contrast': palette.primary.contrastText,
    '--app-color-text-primary': palette.text.primary,
    '--app-color-text-muted': palette.text.secondary,
    '--app-color-surface': palette.background.paper,
    '--app-color-background': palette.background.default,
    '--app-color-border': palette.divider,
    '--app-color-focus-ring': `rgba(${palette.primary.mainChannel} / 0.2)`,

    '--app-font-family': theme.typography.fontFamily,
    '--app-font-size-logo': theme.typography.pxToRem(18),
    '--app-font-weight-bold': theme.typography.fontWeightBold,

    '--app-space-1': theme.spacing(0.5),
    '--app-space-2': theme.spacing(1),
    '--app-space-3': theme.spacing(1.5),
    '--app-space-4': theme.spacing(2),

    '--app-radius-sm': `${theme.shape.borderRadius}px`,
    '--app-radius-md': `${theme.shape.borderRadius * 1.5}px`,
    '--app-shadow-z1': customShadows.z1
  };
}
