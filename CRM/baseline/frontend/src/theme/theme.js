import { alpha, createTheme } from '@mui/material/styles';

export const crmTheme = createTheme({
  palette: {
    primary: {
      main: '#0f4c5c',
      dark: '#092f38',
      light: '#5d8893',
    },
    secondary: {
      main: '#c8553d',
      dark: '#903726',
      light: '#dd8e7d',
    },
    background: {
      default: '#f6f1e8',
      paper: '#fffaf2',
    },
    success: {
      main: '#2d6a4f',
    },
    warning: {
      main: '#bc6c25',
    },
  },
  shape: {
    borderRadius: 18,
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
          backgroundImage:
            'linear-gradient(120deg, rgba(15,76,92,0.94), rgba(200,85,61,0.9))',
          boxShadow: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(15, 76, 92, 0.08)',
          boxShadow: '0 18px 40px rgba(15, 76, 92, 0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage:
            'radial-gradient(circle at top right, rgba(200,85,61,0.05), transparent 34%)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#132a31',
          color: '#f8f5ef',
          borderRight: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: alpha('#0f4c5c', 0.08),
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