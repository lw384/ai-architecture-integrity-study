/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,jsx}'],
    theme: {
        extend: {
            colors: {
                primary: 'var(--color-primary)',
                'primary-dark': 'var(--color-primary-dark)',
                secondary: 'var(--color-secondary)',
                surface: 'var(--color-surface)',
                'surface-subtle': 'var(--color-surface-subtle)',
                border: 'var(--color-border)',
            },
            spacing: {
                base: 'var(--spacing-base)',
            },
            borderRadius: {
                sm: 'var(--radius-sm)',
                md: 'var(--radius-md)',
                lg: 'var(--radius-lg)',
            },
            boxShadow: {
                soft: '0 18px 40px rgba(15, 76, 92, 0.08)',
            },
        },
    },
    plugins: [],
};