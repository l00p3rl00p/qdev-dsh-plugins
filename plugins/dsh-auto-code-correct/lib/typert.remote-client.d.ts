import { t as Language } from "./capabilities-DVURxqpt.js";
import * as _deepseek_ai_dsh_typert_protocol0 from "@deepseek-ai/dsh-typert-protocol";
import { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";

//#region src/readiness.d.ts
type ReadinessState = 'disabled' | 'installed' | 'configured' | 'ready' | 'unavailable' | 'failed';
interface AccReadinessTool {
  id: string;
  label: string;
  language: Language | 'hygiene';
  state: ReadinessState;
  executable: string;
  path?: string;
  version?: string;
  detail: string;
}
interface AccReadinessSnapshot {
  checkedAt: number;
  projectPath: string;
  project: Record<'packageJson' | 'tsconfig' | 'eslintConfig' | 'cargoToml' | 'pyproject', boolean>;
  tools: AccReadinessTool[];
}
//#endregion
//#region src/typert.remote-client.d.ts
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    accReadiness: {
      snapshot(signal?: AbortSignal): Promise<RemoteResult<AccReadinessSnapshot>>;
    };
  }
}
/** Generated-equivalent client contract for ACC's read-only Remote service. */
declare const TYPERT_REMOTE: _deepseek_ai_dsh_typert_protocol0.TypertRemoteInfo<Readonly<Record<string, _deepseek_ai_dsh_typert_protocol0.TypertRemoteMethod<object, unknown, "unary", never, unknown> | _deepseek_ai_dsh_typert_protocol0.TypertRemoteMethod<object, unknown, "stream", unknown, unknown>>>>;
//#endregion
export { TYPERT_REMOTE };