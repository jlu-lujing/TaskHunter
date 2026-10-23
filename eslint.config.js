import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'
import { fileURLToPath } from 'node:url'

// A physical horizontal Tailwind class (`ml-`, `pr-`, `left-`, `text-right`,
// `rounded-l`, `border-r`...) inside a class list. `left-1/2` stays allowed: it
// centres together with `-translate-x-1/2`, which only works physically.
const PHYSICAL_CLASS =
  '(^|[\\s:!])-?(m[lr]|p[lr]|left|right|scroll-[mp][lr])-(?!1\\x2F2)(\\d|\\[|\\(|(auto|px|full)(?=$|[\\s!]))' +
  '|(^|[\\s:!])text-(left|right)(?=$|[\\s!])' +
  '|(^|[\\s:!])(rounded-(l|r|tl|tr|bl|br)|border-(l|r))(?=$|[\\s!-])'
// Where class lists live: className props, cn()/clsx()/cva() calls, and
// variables or object keys named after classes.
const CLASS_CONTEXT =
  ':matches(JSXAttribute[name.name=/[Cc]lass[Nn]ame$/], CallExpression[callee.name=/^(cn|clsx|cva)$/], VariableDeclarator[id.name=/[Cc]lass|CLASS/], Property[key.name=/[Cc]lass/])'
const PHYSICAL_CLASS_MESSAGE =
  'Use logical sides (ms/me, ps/pe, inset-s/inset-e, text-start/end, rounded-s/e, border-s/e) so the layout mirrors in Arabic and Hebrew. A side that is physical on purpose takes an eslint-disable-next-line comment saying why; see the rtl-layout skill.'

export default tseslint.config([
  globalIgnores(['dist', '.openchamber']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Absolute, because each package runs ESLint from its own folder with --config.
    basePath: fileURLToPath(new URL('./packages/ui', import.meta.url)),
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `${CLASS_CONTEXT} Literal[value=/${PHYSICAL_CLASS}/]`, message: PHYSICAL_CLASS_MESSAGE },
        { selector: `${CLASS_CONTEXT} TemplateElement[value.raw=/${PHYSICAL_CLASS}/]`, message: PHYSICAL_CLASS_MESSAGE },
      ],
    },
  },
])
