import { defineConfig } from 'tsdown'

const clientModules = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
]
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts',
      'typert.host': 'src/typert.host.ts',
      'typert.remote-client': 'src/typert.remote-client.ts',
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: true,
    clean: true,
    // Both native and third-party LSP integrations are resolved only when
    // enabled; never copy their implementations into ACC's Host bundle.
    deps: { neverBundle: [/^@deepseek-ai\//, 'dsh-lsp-actions'] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.client.json',
    clean: false,
    dts: false,
    deps: {
      neverBundle: clientModules,
      // DSH Web only supplies the modules explicitly externalized above.
      // Typert remote-info and zod must be physically bundled into client.js.
      alwaysBundle: [
        '@deepseek-ai/dsh-typert-protocol',
        '@deepseek-ai/dsh-typert-protocol/remote-info',
        'zod',
      ],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-auto-code-correct", factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
