import { Context } from "@deepseek-ai/cordis";

//#region src/index.d.ts

declare const name = "telemetry-seams";
declare const inject: string[];
interface TelemetrySeamsConfig {
  collector: {
    otlpGrpc: string;
    otlpHttp: string;
    health: string;
    zpages: string;
    probeTimeoutMillis: number;
  };
  includeInternal: boolean;
}
declare function apply(ctx: Context, config: TelemetrySeamsConfig): void;
//#endregion
export { TelemetrySeamsConfig, apply, inject, name };