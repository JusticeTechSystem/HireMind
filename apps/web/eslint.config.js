import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
// Static accessibility linting of every component (labels, roles, keyboard handlers, alt text, ARIA validity).
export default [{ linterOptions: { reportUnusedDisableDirectives: 'off' } }, { ...jsxA11y.flatConfigs.recommended, files: ['src/**/*.{ts,tsx}'], languageOptions: { ...jsxA11y.flatConfigs.recommended.languageOptions, parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } }];
