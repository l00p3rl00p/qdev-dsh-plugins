import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'

// Bundle the real Typert runtime into DSH Web; it is not a browser loader module.
const remoteInfoRuntime = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-typert-protocol/remote-info'))
if (!remoteInfoRuntime.endsWith('.js')) throw new Error('Typert remote-info resolved to a non-JavaScript entry')

const clientModules = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-conversation',
]

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: true,
    clean: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    // A browser ModuleLoader bundle must not inherit package engines.node.
    // Retain DSH's required CJS wrapper while targeting browser syntax.
    target: 'es2022',
    alias: {
      '@deepseek-ai/dsh-typert-protocol/remote-info': remoteInfoRuntime,
    },
    clean: false,
    dts: false,
    deps: {
      neverBundle: clientModules,
      alwaysBundle: [
        '@deepseek-ai/dsh-typert-protocol',
        '@deepseek-ai/dsh-typert-protocol/remote-info',
        'zod',
      ],
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner:
        'window.__ModuleLoader__.load({ id: "dsh-telemetry-seams", factory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
