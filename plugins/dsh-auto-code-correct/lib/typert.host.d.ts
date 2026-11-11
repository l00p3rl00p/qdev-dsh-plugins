import * as _deepseek_ai_dsh_typert_protocol2 from "@deepseek-ai/dsh-typert-protocol";

//#region src/typert.host.d.ts
/** Host descriptor discovered by DSH Typert Loader from this package's ./typert export. */
declare const TYPERT: {
  package: string;
  face: "host";
  schemas: never[];
  readonly invocations: readonly _deepseek_ai_dsh_typert_protocol2.InvocationDescriptor[];
  model: {
    services: {
      description: string;
      summary: string;
      tags: never[];
      jsDoc: string;
      key: string;
      exportName: string;
      members: {
        kind: string;
        name: string;
        signature: string;
        summary: string;
        jsDoc: string;
      }[];
      types: never[];
    }[];
    events: never[];
    objects: never[];
  };
};
//#endregion
export { TYPERT };