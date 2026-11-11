import { t as Language } from "./capabilities-DVURxqpt.js";
import z from "@deepseek-ai/schemastery";
import { Context, Volatile } from "@deepseek-ai/cordis";
import { ToolExecution, ToolExecutionResult } from "@deepseek-ai/dsh-tools";

//#region src/index.d.ts

declare const name = "auto-code-correct";
declare const inject: string[];
/**
 * One external checker: which files it claims, how to invoke it, and how to
 * read its verdict. Every deployment-varying value is a field here — the
 * plugin holds no built-in command, timeout, or output cap.
 */
interface CheckerConfig {
  /** Label shown to the model above this checker's output. */
  name: string;
  /**
   * Lowercase, leading-dot file extensions this checker claims (`['.ts', '.tsx']`).
   * A file matching no checker produces no diagnostics.
   */
  extensions: string[];
  /**
   * Executable and arguments. `argv[0]` is resolved against the subprocess
   * provider's scrubbed PATH; it is never shell-interpreted. Three
   * placeholders are substituted per run: `{file}` (absolute path of the
   * edited file), `{relFile}` (that path relative to `cwd`), and `{dir}` (its
   * containing directory).
   */
  argv: string[];
  /** Working directory, resolved against the harness process directory (the workspace root). */
  cwd: string;
  /** Wall-clock bound for one run; the process tree is terminated when it expires. */
  timeoutMs: number;
  /** SIGTERM-to-SIGKILL grace for that termination. */
  graceMs: number;
  /** In-memory cap per collected stream; overflow keeps the tail. */
  maxOutputBytes: number;
  /** Exit codes meaning "no findings"; any other code reports the collected output. */
  cleanExitCodes: number[];
  /** Which streams carry findings, in the order they are concatenated. */
  streams: ('stdout' | 'stderr')[];
}
/**
 * Plugin config. `checkers` is empty by default: a deployment declares the
 * checkers its toolchain actually has, since a built-in `tsc` or `eslint`
 * invocation would be exactly the hardcoded tunable this repo's conventions
 * forbid.
 */
interface Config {
  /** Primary language switches: disabled languages are never evaluated. */
  languages: Volatile<Record<Language, boolean>>;
  /** Individual named capabilities; false disables one fixer or checker. */
  capabilities: Volatile<Record<string, boolean>>;
  /** Native Git pre-commit hygiene runs automatically unless explicitly disabled. */
  hygieneEnabled: Volatile<boolean>;
  /** Language-server capability switches; gated by the corresponding language master. */
  languageServers: Volatile<Record<Language, boolean>>;
  /** Optional absolute or PATH-resolvable command overrides by executable name. */
  executables: Volatile<Record<string, string>>;
  /** Tool names whose successful results are inspected for an edited file. */
  tools: string[];
  /** Checkers, consulted in order; every checker claiming the extension runs. */
  checkers: CheckerConfig[];
  /** Ordered mutating commands, completed before read-only verification. */
  fixers: CheckerConfig[];
  /** Cap on the model-visible diagnostic text per tool result; overflow keeps the head. */
  maxDiagnosticChars: number;
}
declare const Config: z;
/**
 * The source stamped on every context this plugin injects. The `plugin` label
 * is load-bearing: an unlabeled context renders as a user prompt in derived
 * history.
 */
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'auto-code-correct': {
      kind: 'auto-code-correct';
    };
  }
}
/**
 * Resolve the file a completed tool call mutated. The canonical value is
 * authoritative — `write` and `edit` both return the backend-resolved `path`,
 * which is the path that was actually touched — and the model-supplied
 * `file_path` argument is the fallback for a tool that declares no such value.
 * @param exec - the completed execution.
 * @param result - its successful result.
 * @returns the edited path, or undefined when neither source carries one.
 */
declare function editedPath(exec: ToolExecution, result: Readonly<ToolExecutionResult>): string | undefined;
/**
 * Install the post-edit diagnostic listener.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param config - validated {@link Config}; checker invariants are re-checked fail-loud here.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { CheckerConfig, Config, apply, editedPath, inject, name };