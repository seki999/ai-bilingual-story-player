import tseslint from "typescript-eslint";
export default [
  { ignores: ["dist/**", "playwright-report/**", "test-results/**"] },
  ...tseslint.configs.recommended,
];
