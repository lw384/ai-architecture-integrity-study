import buildCssVariables from '../cssVariables';

/** Keep global browser defaults and CSS Module tokens aligned with the theme. */
export default function CssBaseline(theme) {
  const palette = theme.vars?.palette ?? theme.palette;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': buildCssVariables(theme),
        html: {
          fontFamily: theme.typography.fontFamily
        },
        body: {
          margin: 0,
          minHeight: '100vh',
          backgroundColor: palette.background.default,
          color: palette.text.primary,
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        },
        '*, *::before, *::after': {
          boxSizing: 'border-box'
        },
        '#root': {
          minHeight: '100vh'
        },
        a: {
          color: 'inherit'
        },
        ':focus-visible': {
          outline: '2px solid var(--app-color-focus-ring)',
          outlineOffset: 2
        }
      }
    }
  };
}
