import PropTypes from 'prop-types';
import { useMemo } from 'react';

// material-ui
import { createTheme, StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// project imports
import useLayoutSettings from 'hooks/useLayoutSettings';
import CustomShadows from './custom-shadows';
import componentsOverride from './overrides';
import { buildPalette } from './palette';
import Typography from './typography';

// ==============================|| DEFAULT THEME - MAIN ||============================== //

export default function ThemeCustomization({ children }) {
  const { state } = useLayoutSettings();

  const themeTypography = useMemo(() => Typography(state.fontFamily), [state.fontFamily]);

  const palette = useMemo(() => buildPalette(state.presetColor), [state.presetColor]);

  const customShadows = useMemo(
    () => ({
      light: CustomShadows(palette.light),
      dark: CustomShadows(palette.dark)
    }),
    [palette]
  );

  const activeColorScheme = state.themeMode === 'dark' ? 'dark' : 'light';

  const themeOptions = useMemo(
    () => ({
      breakpoints: {
        values: {
          xs: 0,
          sm: 768,
          md: 1024,
          lg: 1266,
          xl: 1440
        }
      },
      direction: 'ltr',
      mixins: {
        toolbar: {
          minHeight: 60,
          paddingTop: 8,
          paddingBottom: 8
        }
      },
      palette: palette[activeColorScheme],
      typography: themeTypography,
      customShadows: customShadows[activeColorScheme],
      colorSchemes: {
        light: {
          palette: palette.light,
          customShadows: customShadows.light
        },
        dark: {
          palette: palette.dark,
          customShadows: customShadows.dark
        }
      },
      cssVariables: {
        cssVarPrefix: '',
        colorSchemeSelector: 'data-color-scheme'
      }
    }),
    [activeColorScheme, customShadows, palette, themeTypography]
  );

  const themes = createTheme(themeOptions);
  themes.components = componentsOverride(themes);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider disableTransitionOnChange theme={themes} defaultMode={activeColorScheme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

ThemeCustomization.propTypes = { children: PropTypes.node };
