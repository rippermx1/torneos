import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Feature-Sliced layers: each layer imports only lower layers, never a sibling
// slice, and lower slices only through their public index. See docs/ARQUITECTURA.md.
const LAYER_MESSAGE = 'Viola la regla de capas: ver docs/ARQUITECTURA.md'
const LAYERS = {
  shared:   ['@entities/*', '@features/*', '@widgets/*', '@views/*'],
  entities: ['@entities/*', '@entities/*/**', '@features/*', '@widgets/*', '@views/*'],
  features: ['@features/*', '@features/*/**', '@widgets/*', '@views/*', '@entities/*/**'],
  widgets:  ['@widgets/*', '@widgets/*/**', '@views/*', '@entities/*/**', '@features/*/**'],
  views:    ['@views/*', '@views/*/**', '@entities/*/**', '@features/*/**', '@widgets/*/**'],
}
const DOMAIN_FORBIDDEN = ['react', 'react/*', 'next', 'next/*', '@supabase/*', '**/infrastructure/**', '**/ui/**', '@shared/ui', '@shared/ui/**']
const restrict = (group) => ({ 'no-restricted-imports': ['error', { patterns: [{ group, message: LAYER_MESSAGE }] }] })
const layerBlocks = Object.entries(LAYERS).flatMap(([layer, group]) => [
  { files: [`src/${layer}/**`], rules: restrict(group) },
  // Flat config replaces a rule instead of merging it, so domain repeats the layer list.
  { files: [`src/${layer}/**/domain/**`], rules: restrict([...group, ...DOMAIN_FORBIDDEN]) },
])

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layerBlocks,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/config/**', 'src/**/__tests__/**'],
    rules: { 'no-magic-numbers': ['error', { ignore: [-1, 0, 1], ignoreArrayIndexes: true, enforceConst: true }] },
  },
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/**/__tests__/**'],
    rules: { 'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "artifacts/**",
    "public/games/**",
    "**/Library/**",
    "**/Builds/**",
    // Archivos generados al levantar Supabase CLI localmente.
    "supabase/.temp/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
