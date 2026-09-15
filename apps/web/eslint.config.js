import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**'] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        // Drei Programme: App, Werkzeuge (Node), Service Worker (WebWorker).
        project: ['./tsconfig.json', './tsconfig.node.json', './tsconfig.sw.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // `configs.flat.*` ist die Flat-Config-Variante; `configs['recommended-latest']`
  // liegt noch im alten eslintrc-Format vor und wird von ESLint 10 abgelehnt.
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,

  {
    rules: {
      // Verschluckte Promises sind in dieser App teuer: Fortschritt schreiben,
      // Downloads, Service-Worker-Nachrichten laufen alle asynchron.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Konfigurationsdateien laufen in Node, nicht im Browser.
  {
    files: ['*.config.{js,ts}', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Der Service Worker hat weder `window` noch `document`.
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },

  // Die ESLint-Konfiguration selbst ist JavaScript und gehört zu keinem
  // TypeScript-Programm – typbasierte Regeln können hier nichts prüfen.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
)
