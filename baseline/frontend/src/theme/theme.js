import { alpha, createTheme } from '@mui/material/styles';

export const crmTheme = createTheme({
  palette: {
    primary: {
      main: '#4d8af0',
      dark: '#2f6fe0',
      light: '#7aa7f5',
    },
    secondary: {
      main: '#fa8c16',
      dark: '#d46b08',
      light: '#ffb15c',
    },
    background: {
      default: '#f5f7fa',
      paper: '#ffffff',
    },
    success: {
      main: '#52c41a',
    },
    warning: {
      main: '#faad14',
    },
    text: {
      primary: '#303133',
      secondary: '#606266',
    },
    sidebar: {
      textPrimary: 'var(--color-menu-text)',
      textSecondary: 'var(--color-menu-text-muted)',
      textDisabled: 'var(--color-menu-text-disabled)',
      backgroundHover: 'rgba(255, 255, 255, 0.08)',
      backgroundSelected: 'var(--color-menu-active)',
    },
  },
  shape: {
    borderRadius: 3,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", sans-serif',
    h1: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h2: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h3: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h4: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h5: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    h6: {
      fontFamily: '"Space Grotesk", sans-serif',
      fontWeight: 700,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          backgroundImage: 'none',
          color: '#303133',
          borderBottom: '1px solid #ebeef5',
          backdropFilter: 'blur(10px)',
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #ebeef5',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage:
            'radial-gradient(circle at top right, rgba(77,138,240,0.06), transparent 34%)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#191a23',
          color: 'hsla(0, 0%, 100%, 0.95)',
          borderRight: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ ownerState, theme }) => ({
          minHeight: 46,
          borderRadius: theme.shape.borderRadius * 2,
          color: theme.palette.sidebar.textPrimary,
          transition: theme.transitions.create(['background-color', 'color'], {
            duration: theme.transitions.duration.shorter,
          }),
          '&:hover': {
            backgroundColor: theme.palette.sidebar.backgroundHover,
          },
          '& .MuiListItemText-primary': {
            color: 'inherit',
          },
          '& .MuiListItemText-secondary': {
            color: theme.palette.sidebar.textSecondary,
          },
          '&.Mui-disabled': {
            color: theme.palette.sidebar.textDisabled,
          },
          '&.Mui-selected': {
            backgroundColor: theme.palette.sidebar.backgroundSelected,
            color: theme.palette.common.white,
            '&:hover': {
              backgroundColor: theme.palette.primary.dark,
            },
          },
          ...(ownerState.selected
            ? {
              boxShadow: `0 8px 18px ${alpha(theme.palette.primary.main, 0.28)}`,
            }
            : {}),
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: alpha('#4d8af0', 0.08),
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});