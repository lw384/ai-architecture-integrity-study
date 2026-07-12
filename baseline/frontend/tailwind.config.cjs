/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['selector', '[data-theme="dark"]'],
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        container: {
            center: true,
            padding: {
                DEFAULT: '1rem',
                sm: '1.25rem',
                lg: '1.5rem',
                xl: '2rem'
            }
        },
        extend: {
            colors: {
                // MUI theme colors (themes/palette.js) are exposed as real CSS variables
                // via createTheme({ cssVariables: { cssVarPrefix: '' } }) in themes/index.jsx.
                // Pointing these tokens at var(--palette-*) keeps Tailwind in sync with the
                // live MUI theme (dark mode / preset color switching) instead of duplicating it.
                primary: {
                    DEFAULT: 'var(--palette-primary-main)',
                    lighter: 'var(--palette-primary-lighter)',
                    light: 'var(--palette-primary-light)',
                    main: 'var(--palette-primary-main)',
                    dark: 'var(--palette-primary-dark)',
                    darker: 'var(--palette-primary-darker)',
                    contrastText: 'var(--palette-primary-contrastText)'
                },
                secondary: {
                    DEFAULT: 'var(--palette-secondary-main)',
                    lighter: 'var(--palette-secondary-lighter)',
                    light: 'var(--palette-secondary-light)',
                    main: 'var(--palette-secondary-main)',
                    dark: 'var(--palette-secondary-dark)'
                },
                text: {
                    DEFAULT: 'var(--palette-text-primary)',
                    primary: 'var(--palette-text-primary)',
                    secondary: 'var(--palette-text-secondary)'
                },
                'text-muted': 'var(--color-text-muted)',
                divider: 'var(--palette-divider)',
                grey: {
                    100: 'var(--palette-grey-100)',
                    300: 'var(--palette-grey-300)'
                },
                surface: 'var(--color-surface)',
                'surface-subtle': 'var(--color-surface-subtle)',
                border: 'var(--color-border)'
            },
            spacing: {
                base: 'var(--spacing-base)'
            },
            borderRadius: {
                sm: 'var(--radius-sm)',
                md: 'var(--radius-md)',
                lg: 'var(--radius-lg)'
            },
            boxShadow: {
                soft: 'var(--shadow-soft)',
                z1: 'var(--customShadows-z1)'
            },
            fontFamily: {
                sans: ['Public Sans', 'sans-serif'],
                display: ['Space Grotesk', 'Public Sans', 'sans-serif']
            },
            screens: {
                xs: '480px',
                sm: '768px',
                md: '1024px',
                lg: '1266px',
                xl: '1440px'
            }
        }
    },
    plugins: []
};