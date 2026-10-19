import { defineConfig } from '@pandacss/dev';
import basePreset from '@pandacss/preset-base';
import pandaPreset from '@pandacss/preset-panda';

export default defineConfig({
  presets: [basePreset, pandaPreset],
  preflight: true,
  include: ['./src/**/*.{ts,tsx}'],
  outdir: 'styled-system',
  theme: {
    // Match the layout names in Figma; replace the preset's breakpoint names.
    breakpoints: {
      mobile: '0rem',
      tablet: '48rem',
      desktop: '64rem',
    },
    extend: {
      tokens: {
        colors: {
          brand: {
            primary: { value: '#0f766e' },
            hover: { value: '#115e59' },
            soft: { value: '#f0fdfa' },
          },
        },
        fonts: {
          sans: { value: "'Inter Variable', ui-sans-serif, system-ui, sans-serif" },
        },
        fontSizes: {
          title: { value: '2rem' },
        },
        sizes: {
          // Includes 32px side padding: the usable desktop content is 1152px.
          page: { value: '76rem' },
        },
      },
      semanticTokens: {
        colors: {
          bg: {
            canvas: { value: '{colors.slate.50}' },
            surface: { value: '{colors.white}' },
            subtle: { value: '{colors.slate.100}' },
          },
          fg: {
            DEFAULT: { value: '{colors.slate.900}' },
            muted: { value: '{colors.slate.600}' },
            onAccent: { value: '{colors.white}' },
          },
          border: {
            DEFAULT: { value: '{colors.slate.200}' },
          },
          action: {
            primary: { value: '{colors.brand.primary}' },
            primaryHover: { value: '{colors.brand.hover}' },
          },
          status: {
            success: { value: '{colors.green.800}' },
            danger: { value: '{colors.red.700}' },
            dangerSoft: { value: '{colors.red.50}' },
          },
          focus: {
            ring: { value: '{colors.brand.primary}' },
          },
        },
      },
      textStyles: {
        pageTitle: {
          value: {
            fontSize: { mobile: '2xl', tablet: 'title' },
            lineHeight: { mobile: '2rem', tablet: '2.5rem' },
            fontWeight: 'semibold',
          },
        },
        heading: {
          value: { fontSize: '2xl', lineHeight: '2rem', fontWeight: 'semibold' },
        },
        body: {
          value: { fontSize: 'md', lineHeight: '1.5rem' },
        },
        small: {
          value: { fontSize: 'sm', lineHeight: '1.25rem' },
        },
        label: {
          value: { fontSize: 'sm', lineHeight: '1.25rem', fontWeight: 'semibold' },
        },
      },
      recipes: {
        button: {
          className: 'button',
          jsx: ['Button'],
          base: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2',
            minHeight: '11',
            px: '4',
            py: '3',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: 'lg',
            textStyle: 'label',
            cursor: 'pointer',
            textDecoration: 'none',
            _focusVisible: {
              outline: '2px solid',
              outlineColor: 'focus.ring',
              outlineOffset: '2px',
            },
            _disabled: { opacity: 0.45, cursor: 'not-allowed' },
          },
          variants: {
            visual: {
              primary: {
                bg: 'action.primary',
                color: 'fg.onAccent',
                borderColor: 'action.primary',
                '&:not(:disabled):hover': { bg: 'action.primaryHover' },
              },
              secondary: {
                bg: 'bg.surface',
                color: 'fg',
                borderColor: 'border',
                '&:not(:disabled):hover': { bg: 'bg.subtle' },
              },
              danger: {
                bg: 'transparent',
                color: 'status.danger',
                borderColor: 'transparent',
                '&:not(:disabled):hover': { bg: 'status.dangerSoft' },
              },
            },
          },
          defaultVariants: { visual: 'primary' },
        },
      },
    },
  },
  globalCss: {
    'html, body': { minHeight: '100%' },
    body: { bg: 'bg.canvas', color: 'fg', fontFamily: 'sans', textStyle: 'body' },
    'button, input': { font: 'inherit' },
  },
});
