import { defineConfig } from 'tsdown'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// DSH's generated Typert client imports this public subpath. Rolldown can
// externalize it before tsdown's dependency policy sees it, leaving a browser
// require() that DSH Web's ModuleLoader cannot satisfy. Resolve the public
// export to its runnable JS file at the bundler boundary instead.
const typertRemoteInfoRuntime = require.resolve('@deepseek-ai/dsh-typert-protocol/remote-info')

const bundleTypertRemoteInfo = {
  name: 'acc-bundle-typert-remote-info',
  resolveId(source: string) {
    if (source === '@deepseek-ai/dsh-typert-protocol/remote-info') {
      return typertRemoteInfoRuntime
    }
    return null
  },
}

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
    plugins: [bundleTypertRemoteInfo],
    clean: false,
    dts: false,
    deps: {
      neverBundle: clientModules,
      // DSH Web only supplies the modules explicitly externalized above.
      // Bundle the pure Typert metadata helper and its schema dependency.
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
