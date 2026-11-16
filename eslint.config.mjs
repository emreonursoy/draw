import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts']),
  {
    rules: {
      // The editor deliberately keeps its mutable state in refs (st/misc/drag) and redraws imperatively;
      // these React Compiler rules assume a pure-render architecture and flag that design everywhere.
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      // Thumbnails and previews are data: URLs from canvas, which next/image cannot optimise.
      '@next/next/no-img-element': 'off',
      // Loose `any` remains in props such as `actions` and SDK wrappers: reported as warnings until those are typed.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Code that parses untrusted JSON and the tests that feed it garbage legitimately work with `any`.
    files: ['src/lib/element.ts', 'src/lib/interchange.ts', 'src/lib/share.ts', 'tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]);
