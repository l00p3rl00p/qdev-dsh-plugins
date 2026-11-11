import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { Context, Service } from "@deepseek-ai/cordis";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";

//#region node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.2.1-rc.5_@deepseek-ai+cordis@4.0.5/node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
/** Generic invocation-owned values returned by synchronous Client Context resolvers. */
/** Shared identity across independently bundled Context providers and Gateway. */
const TYPERT_OWNED_VALUE = Symbol.for("dsh.typert.owned-value");
/**
* Remote decorators and explicit Gateway bindings backed by versioned
* descriptors carried on decorated class prototypes. Strict reflection
* remains a Typert compiler responsibility.
* @module @deepseek-ai/dsh-typert-protocol
*/
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Test one generated Remote name against the Connection endpoint grammar.
* @param value - namespace, method, lookup, or Context segment.
* @returns whether the value can cross the shared RPC carrier unchanged.
*/
function isTypertRemoteSegment(value) {
	return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/**
* Bind one visible Service field to a Cordis key and Remote namespace. A
* service that owns a Cordis Context also gives its tree `ctx.invocation`,
* `undefined` outside a Remote call, so no `TypertRemoteService` is needed for
* a Host composition to read it.
* @param service - owning Service instance, normally `this`.
* @param serviceKey - exact Cordis service key.
* @param options - optional wire namespace.
* @returns a frozen, inspectable binding with no compiler-injected metadata.
*/
function bindTypertRemote(service, serviceKey, options = {}) {
	validateName("service key", serviceKey);
	const namespace = options.namespace ?? serviceKey;
	validateName("namespace", namespace);
	const ctx = Reflect.get(service, "ctx");
	if (Context.is(ctx)) provideInvocationAccessor(ctx);
	return Object.freeze({
		service,
		serviceKey,
		namespace
	});
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
var TypertRemoteService = class extends Service {
	/** Visible binding consumed by the Gateway's source-mode discovery. */
	typertRemote;
	/**
	* Register the Service and bind the same key to Typert Gateway.
	* @param ctx - owning Cordis Context.
	* @param serviceKey - exact Cordis service key and default wire namespace.
	* @param options - optional wire namespace.
	*/
	constructor(ctx, serviceKey, options = {}) {
		super(ctx, serviceKey);
		this.typertRemote = bindTypertRemote(this, this.name, options);
	}
};
/**
* Make `ctx.invocation` read as `undefined` outside a Remote call instead of the
* reflect service's "cannot get property" error; a call-derived Context shadows
* the accessor with its own property. The first Remote Service constructed in a
* tree registers it on the root, where it outlives any one Service.
*/
function provideInvocationAccessor(ctx) {
	if (Object.hasOwn(ctx.root.reflect.props, "invocation")) return;
	ctx.root.accessor("invocation", { get: () => void 0 });
}
function Remote(methodExportOrOptions, context) {
	if (typeof methodExportOrOptions === "string") {
		validateName("Remote export name", methodExportOrOptions);
		return remoteDecorator({ kind: "direct" }, { exportName: methodExportOrOptions });
	}
	if (typeof methodExportOrOptions === "object") return remoteDecorator({ kind: "direct" }, markerOptions(methodExportOrOptions, REMOTE_OPTION_KEYS, "Remote options require name, mode: \"stream\", or resources"));
	if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
	addMarkerInitializer(context, { kind: "direct" });
}
const REMOTE_OPTION_KEYS = new Set([
	"name",
	"mode",
	"resources"
]);
/** Validate one decorator options object against its accepted keys and select the marker fields. */
function markerOptions(options, accepted, requirement) {
	const keys = Reflect.ownKeys(options);
	if (keys.length === 0 || keys.some((key) => typeof key !== "string" || !accepted.has(key)) || Object.hasOwn(options, "mode") && options.mode !== "stream") throw new TypeError(`typert-protocol: ${requirement}`);
	const { mode, name: name$1, resources } = options;
	if (name$1 !== void 0) validateName("Remote export name", name$1);
	return {
		...mode === void 0 ? {} : { mode },
		...name$1 === void 0 ? {} : { exportName: name$1 },
		...resources === void 0 ? {} : { resources: resourceReaders(resources) }
	};
}
/** Freeze declared readers into the marker record; a misdeclared reader fails at decoration. */
function resourceReaders(resources) {
	const readers = {};
	for (const [kind, reader] of Object.entries(resources)) {
		if (typeof reader !== "function") throw new TypeError(`typert-protocol: Remote resource reader "${kind}" must be a function`);
		readers[kind] = reader;
	}
	if (Object.keys(readers).length === 0) throw new TypeError("typert-protocol: Remote resources require at least one reader");
	return Object.freeze(readers);
}
function remoteDecorator(invocation, options = {}) {
	return function(_method, context) {
		addMarkerInitializer(context, invocation, options);
	};
}
function readRemoteMethodDescriptor(prototype) {
	const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
	if (property === void 0) return void 0;
	const descriptor = property.value;
	if (descriptor === null || typeof descriptor !== "object") throw new TypeError("typert-protocol: Remote method descriptor must be an object");
	const version = Reflect.get(descriptor, "version");
	if (version !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
	const methods = Reflect.get(descriptor, "methods");
	if (!Array.isArray(methods)) throw new TypeError("typert-protocol: Remote method descriptor methods must be an array");
	return descriptor;
}
function addMarkerInitializer(context, invocation, options = {}) {
	if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
	const method = context.name;
	context.addInitializer(function() {
		const prototype = Object.getPrototypeOf(this);
		if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
		mark(prototype, method, invocation, options);
	});
}
function mark(prototype, method, invocation, { mode, exportName, resources }) {
	const descriptor = readRemoteMethodDescriptor(prototype);
	const marker = Object.freeze({
		method,
		...exportName === void 0 || exportName === method ? {} : { exportName },
		...mode === void 0 ? {} : { mode },
		invocation: Object.freeze(invocation),
		...resources === void 0 ? {} : { resources }
	});
	const current = descriptor?.methods.find((candidate) => candidate.method === method);
	if (current !== void 0) {
		if (current.exportName === marker.exportName && current.mode === marker.mode && current.resources === marker.resources && sameInvocation(current.invocation, invocation)) return;
		throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
	}
	Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([...descriptor?.methods ?? [], marker])
		})
	});
}
function sameInvocation(left, right) {
	if (left.kind === "direct") return right.kind === "direct";
	if (right.kind === "direct") return false;
	return left.context === right.context;
}
function validateName(subject, value) {
	if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}

//#endregion
//#region src/seams/types.ts
/**
* Derive summary health from evidence alone. Empty evidence is never healthy.
*
* Rules:
* - No evidence → `unknown`
* - Any failing evidence → `unavailable` (if no ok evidence) or `configured`
* - All ok, but only `configuration` kind → `configured` (proves wiring, not flow)
* - Any ok `connectivity` evidence + no failures → `operational`
*/
function healthFromEvidence(evidence) {
	if (evidence.length === 0) return "unknown";
	if (!evidence.some((e) => e.ok)) return "unavailable";
	if (!evidence.every((e) => e.ok)) return "configured";
	return evidence.some((e) => e.ok && (e.kind === "connectivity" || e.kind === void 0)) ? "operational" : "configured";
}

//#endregion
//#region src/seams/probe.ts
/**
* Split `host:port` into its parts.
*
* Uses lastIndexOf so an IPv6 literal in brackets still splits at the real
* port separator rather than the first colon inside the address.
*/
function splitHostPort(value) {
	const index = value.lastIndexOf(":");
	if (index <= 0) return null;
	const host = value.slice(0, index);
	const port = Number(value.slice(index + 1));
	if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
	return {
		host,
		port
	};
}
/**
* Test whether a TCP endpoint accepts a connection.
*
* This is a *transport reachability* check only. A successful connect proves
* something is listening; it deliberately does NOT claim that any data was
* accepted, exported, or stored.
*/
function probeTcp(target, timeoutMillis) {
	const at = (/* @__PURE__ */ new Date()).toISOString();
	const parsed = splitHostPort(target);
	if (parsed === null) return Promise.resolve({
		probe: "tcp-connect",
		kind: "connectivity",
		ok: false,
		detail: `unparseable endpoint "${target}"`,
		at
	});
	return new Promise((resolve) => {
		const socket = connect({
			host: parsed.host,
			port: parsed.port
		});
		let settled = false;
		const finish = (ok, detail) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve({
				probe: "tcp-connect",
				ok,
				detail,
				at
			});
		};
		socket.setTimeout(timeoutMillis);
		socket.once("connect", () => finish(true, `${target} accepted TCP connection`));
		socket.once("timeout", () => finish(false, `${target} timed out after ${timeoutMillis}ms`));
		socket.once("error", (error) => finish(false, `${target} ${error.message}`));
	});
}
/**
* Fetch a URL with a hard deadline and return its body, or null.
*
* `AbortSignal.timeout` bounds the whole request including body read, so a
* hung collector cannot stall the inventory tool.
*/
async function fetchText(url, timeoutMillis) {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMillis) });
		if (!response.ok) return null;
		return await response.text();
	} catch {
		return null;
	}
}
/**
* Parse the Collector's `pipelinez` HTML into structured pipelines.
*
* The zpages table interleaves data cells with separator cells containing
* `&nbsp;&nbsp;|&nbsp;&nbsp;`. The actual layout per row is:
*
*   cells[0]  = pipeline name
*   cells[1]  = | separator
*   cells[2]  = inputType
*   cells[3]  = | separator
*   cells[4]  = mutatesData
*   cells[5]  = | separator
*   cells[6]  = receivers (anchor links with zcomponentname=NAME)
*   cells[7]  = | separator
*   cells[8]  = processors
*   cells[9]  = | separator
*   cells[10] = exporters
*
* Component names are extracted from anchor query params:
* `?zpipelinename=...&zcomponentname=NAME&zcomponentkind=KIND`
*
* Returns [] when the shape is unrecognized, which the caller reports as
* "pipeline topology unavailable" rather than inventing a pipeline list.
*/
function parsePipelines(html) {
	const pipelines = [];
	const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
	const componentPattern = /zcomponentname=([^&"]+)/g;
	for (const rowMatch of html.matchAll(rowPattern)) {
		const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
		if (cells.length < 11) continue;
		const name$1 = stripTags(cells[0]);
		const inputType = stripTags(cells[2]);
		if (name$1 === "FullName" || name$1 === "") continue;
		const names = (cell) => {
			const found = [];
			for (const m of cell.matchAll(componentPattern)) {
				const decoded = decodeURIComponent(m[1]);
				if (!found.includes(decoded)) found.push(decoded);
			}
			return found;
		};
		pipelines.push({
			name: name$1,
			inputType,
			receivers: names(cells[6]),
			processors: names(cells[8]),
			exporters: names(cells[10])
		});
	}
	return pipelines;
}
/** Remove HTML tags and collapse whitespace from a zpages table cell. */
function stripTags(value) {
	return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
/** Count files under a directory without recursing indefinitely. */
async function countFiles(root, suffix) {
	let total = 0;
	let entries;
	try {
		entries = await readdir(root);
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const full = join(root, entry);
		try {
			if ((await stat(full)).isDirectory()) total += await countFiles(full, suffix);
			else if (suffix === void 0 || entry.endsWith(suffix)) total += 1;
		} catch {}
	}
	return total;
}
/**
* Build the full seam inventory for this host.
*
* Ordering is deliberate and matters for correctness: the Collector probes run
* first so their evidence can be attached to the transport seams, and the
* session-store sweep runs before the persistence seams so a missing store
* downgrades those seams instead of leaving them looking configured.
*
* @param ctx - the mounting plugin context, used only to detect mounted services.
* @param config - collector endpoints and probe deadline.
* @param env - host identity and filesystem roots.
*/
async function buildInventory(ctx, config, env) {
	const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
	const seams = [];
	const gaps = [];
	const healthBody = await fetchText(config.collector.health, config.collector.probeTimeoutMillis);
	let collectorUpSince;
	let collectorUptime;
	if (healthBody !== null) try {
		const parsed = JSON.parse(healthBody);
		collectorUpSince = parsed.upSince;
		collectorUptime = parsed.uptime;
	} catch {}
	const zpagesBody = await fetchText(config.collector.zpages, config.collector.probeTimeoutMillis);
	const pipelines = zpagesBody === null ? [] : parsePipelines(zpagesBody);
	const collectorReachable = healthBody !== null || pipelines.length > 0;
	const collectorEvidence = {
		probe: "collector-health",
		kind: "connectivity",
		ok: collectorReachable,
		detail: healthBody !== null ? `health endpoint reported ${healthBody.trim().slice(0, 120)}` : `health endpoint ${config.collector.health} did not answer`,
		at: generatedAt
	};
	const pipelineEvidence = {
		probe: "collector-pipelines",
		kind: "connectivity",
		ok: pipelines.length > 0,
		detail: pipelines.length > 0 ? `zpages reported ${pipelines.length} pipeline(s): ${pipelines.map((p) => p.name).join(", ")}` : `no pipelines parsed from ${config.collector.zpages}`,
		at: generatedAt
	};
	if (!collectorReachable) gaps.push(`Collector at ${config.collector.health} is unreachable, so every collector-owned seam is reported from configuration only.`);
	for (const [id, endpoint, protocol] of [[
		"collector.otlp.grpc",
		config.collector.otlpGrpc,
		"gRPC"
	], [
		"collector.otlp.http",
		config.collector.otlpHttp,
		"HTTP/JSON"
	]]) {
		const tcp = await probeTcp(endpoint, config.collector.probeTimeoutMillis);
		seams.push({
			id,
			kind: "transport",
			owner: "collector",
			provides: `OTLP ${protocol} ingress for logs, traces, metrics, and profiles`,
			source: `application exporters targeting ${endpoint}`,
			collection: "OTLP receiver (push)",
			destination: "collector pipelines (logs/traces/metrics/profiles)",
			enabled: true,
			status: tcp.ok ? "operational" : "unavailable",
			health: healthFromEvidence([tcp, pipelineEvidence]),
			evidence: [tcp, pipelineEvidence],
			note: "Presence of this plugin does not affect this endpoint."
		});
	}
	for (const pipeline of pipelines) seams.push({
		id: `collector.pipeline.${pipeline.name}`,
		kind: [
			"logs",
			"metrics",
			"traces",
			"profiles"
		].includes(pipeline.name) ? pipeline.name : "transport",
		owner: "collector",
		provides: `Collector ${pipeline.name} pipeline: ${pipeline.receivers.join(", ") || "no receivers"} → ${pipeline.exporters.join(", ") || "no exporters"}`,
		source: pipeline.receivers.join(", ") || "unreported",
		collection: pipeline.processors.length > 0 ? pipeline.processors.join(" → ") : "no processors",
		destination: pipeline.exporters.join(", ") || "unreported",
		enabled: true,
		status: pipelineEvidence.ok ? "operational" : "unknown",
		health: healthFromEvidence([pipelineEvidence, collectorEvidence]),
		evidence: [pipelineEvidence, collectorEvidence]
	});
	for (const service of [
		{
			id: "dsh.otel.service",
			key: "otel",
			provides: "Shared OTel service that mints independent ordinary-event and session-log channels",
			collection: "ctx.otel.createEventReporter / createSessionLogReporter",
			destination: "caller-selected OTLP/HTTP endpoint (no default)"
		},
		{
			id: "dsh.productTelemetry.service",
			key: "productTelemetry",
			provides: "Product analytics sender for selected usage events",
			collection: "ctx.productTelemetry.emit(record)",
			destination: "configured OTLP/HTTP logs endpoint"
		},
		{
			id: "dsh.sessionTelemetry.service",
			key: "sessionTelemetry",
			provides: "Session-event capture backend: one record per canonical session event",
			collection: "ctx.sessionTelemetry.emit(record) from the capture coordinator",
			destination: "backend-selected pipeline"
		}
	]) {
		const mounted = getService(ctx, service.key);
		const evidence = {
			probe: "service-mounted",
			kind: "configuration",
			ok: mounted,
			detail: mounted ? `ctx.${service.key} is mounted in this profile` : `ctx.${service.key} is not mounted in this profile`,
			at: generatedAt
		};
		seams.push({
			id: service.id,
			kind: "logs",
			owner: "dsh",
			provides: service.provides,
			source: "DSH host runtime",
			collection: service.collection,
			destination: service.destination,
			enabled: mounted,
			status: mounted ? "configured" : "supported",
			health: healthFromEvidence([evidence]),
			evidence: [evidence],
			internal: !isPubliclyDocumented(service.key),
			note: mounted ? "Mounted; delivery to a collector is not proven by mounting alone." : "Shipped by DSH but not mounted in this profile."
		});
	}
	const sessionFiles = await countFiles(env.sessionRoot, ".jsonl") + await countFiles(env.sessionRoot, ".jsonl.zstd");
	const projectionFiles = await countFiles(join(env.dshHome, "storages", "session_projcache", "sessions"), ".json");
	const sessionRootExists = existsSync(env.sessionRoot);
	seams.push({
		id: "dsh.session.persistence.jsonl",
		kind: "session-persistence",
		owner: "dsh",
		provides: "Durable canonical session log: the authoritative append-only record of every session event",
		source: env.sessionRoot,
		collection: "DSH session persistence (append on every canonical event)",
		destination: "local disk (JSONL)",
		enabled: sessionRootExists,
		status: sessionRootExists ? sessionFiles > 0 ? "operational" : "configured" : "unavailable",
		health: healthFromEvidence([{
			probe: "session-log-present",
			kind: "connectivity",
			ok: sessionRootExists && sessionFiles > 0,
			detail: sessionRootExists ? `found ${sessionFiles} session log file(s) under ${env.sessionRoot}` : `session root ${env.sessionRoot} does not exist`,
			at: generatedAt
		}]),
		evidence: [{
			probe: "session-log-present",
			kind: "connectivity",
			ok: sessionRootExists && sessionFiles > 0,
			detail: sessionRootExists ? `found ${sessionFiles} session log file(s) under ${env.sessionRoot}` : `session root ${env.sessionRoot} does not exist`,
			at: generatedAt
		}]
	});
	seams.push({
		id: "dsh.session.projection.cache",
		kind: "session-projection",
		owner: "dsh",
		provides: "Cached session projections used to rehydrate UI state without replaying the canonical log",
		source: join(env.dshHome, "storages", "session_projcache", "sessions"),
		collection: "session projection cache (write-behind)",
		destination: "local disk (JSON)",
		enabled: projectionFiles > 0,
		status: projectionFiles > 0 ? "operational" : "unknown",
		health: healthFromEvidence([{
			probe: "projection-cache-present",
			kind: "connectivity",
			ok: projectionFiles > 0,
			detail: `found ${projectionFiles} projection cache file(s)`,
			at: generatedAt
		}]),
		evidence: [{
			probe: "projection-cache-present",
			kind: "connectivity",
			ok: projectionFiles > 0,
			detail: `found ${projectionFiles} projection cache file(s)`,
			at: generatedAt
		}]
	});
	const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	const telemetryUrl = process.env.DSH_TELEMETRY_OTLP_URL;
	const telemetryMode = process.env.DSH_TELEMETRY_MODE;
	seams.push({
		id: "qdev.env.otel-endpoint",
		kind: "transport",
		owner: "qdev",
		provides: "Deployment-declared OTLP endpoint inherited by standard OpenTelemetry SDK clients",
		source: "OTEL_EXPORTER_OTLP_ENDPOINT",
		collection: "process environment",
		destination: otelEndpoint ?? "unset",
		enabled: otelEndpoint !== void 0,
		status: otelEndpoint === void 0 ? "unavailable" : "configured",
		health: healthFromEvidence([{
			probe: "env-present",
			kind: "configuration",
			ok: otelEndpoint !== void 0,
			detail: otelEndpoint === void 0 ? "OTEL_EXPORTER_OTLP_ENDPOINT is not set" : `set to ${otelEndpoint}`,
			at: generatedAt
		}]),
		evidence: [{
			probe: "env-present",
			kind: "configuration",
			ok: otelEndpoint !== void 0,
			detail: otelEndpoint === void 0 ? "OTEL_EXPORTER_OTLP_ENDPOINT is not set" : `set to ${otelEndpoint}`,
			at: generatedAt
		}]
	});
	seams.push({
		id: "qdev.session-exporter.config",
		kind: "logs",
		owner: "qdev",
		provides: "DSH first-party session exporter endpoint and sharing mode",
		source: "DSH_TELEMETRY_OTLP_URL + DSH_TELEMETRY_MODE",
		collection: "process environment",
		destination: telemetryUrl ?? "unset",
		enabled: telemetryUrl !== void 0 || telemetryMode !== void 0,
		status: telemetryUrl === void 0 && telemetryMode === void 0 ? "unknown" : "configured",
		health: healthFromEvidence([{
			probe: "env-present",
			kind: "configuration",
			ok: telemetryUrl !== void 0 || telemetryMode !== void 0,
			detail: telemetryUrl === void 0 && telemetryMode === void 0 ? "neither DSH_TELEMETRY_OTLP_URL nor DSH_TELEMETRY_MODE is visible to this process" : `DSH_TELEMETRY_OTLP_URL=${telemetryUrl ?? "unset"}, DSH_TELEMETRY_MODE=${telemetryMode ?? "unset"}`,
			at: generatedAt
		}]),
		evidence: [{
			probe: "env-present",
			kind: "configuration",
			ok: telemetryUrl !== void 0 || telemetryMode !== void 0,
			detail: telemetryUrl === void 0 && telemetryMode === void 0 ? "neither DSH_TELEMETRY_OTLP_URL nor DSH_TELEMETRY_MODE is visible to this process" : `DSH_TELEMETRY_OTLP_URL=${telemetryUrl ?? "unset"}, DSH_TELEMETRY_MODE=${telemetryMode ?? "unset"}`,
			at: generatedAt
		}],
		note: telemetryUrl === void 0 ? "Declared in the compose overlay, which is not mounted in this container; delivery cannot be verified from here." : "Configured by environment; delivery requires collector-side confirmation."
	});
	if (telemetryUrl === void 0 && telemetryMode === void 0) gaps.push("The first-party session exporter variables are not visible inside this container, so session-exporter delivery is UNKNOWN rather than verified.");
	return {
		generatedAt,
		host: {
			dshVersion: env.dshVersion,
			profile: env.profile,
			sessionId: env.sessionId
		},
		collector: {
			endpoint: config.collector.health,
			reachable: collectorReachable,
			upSince: collectorUpSince,
			uptime: collectorUptime,
			pipelines
		},
		seams: seams.sort((a, b) => a.id.localeCompare(b.id)),
		gaps
	};
}
/**
* Check whether a Cordis service is mounted without declaring inject on it.
*
* Direct property access on `ctx` triggers Cordis's inject guard and throws
* "cannot get property X without inject" for any service this plugin hasn't
* declared. `ctx.reflect.get(key)` is the safe inspection path: it returns
* the service instance or undefined without touching the guard, keeping this
* plugin fully independent of every service it only observes.
*/
function getService(ctx, key) {
	try {
		const value = ctx.reflect.get(key);
		return value !== void 0 && value !== null;
	} catch {
		return false;
	}
}
/**
* Whether a service key is part of DSH's documented public surface.
*
* Used only to flag "internal interface" in the UI. The list is intentionally
* small and explicit rather than inferred, so the flag never becomes a guess.
*/
function isPubliclyDocumented(key) {
	return key === "otel" || key === "productTelemetry";
}
/** Resolve the DSH home directory from the environment, defaulting to `~/.dsh`. */
function resolveDshHome(home) {
	const explicit = process.env.DSH_HOME;
	if (explicit !== void 0 && isAbsolute(explicit)) return explicit;
	return join(home ?? process.env.HOME ?? ".", ".dsh");
}
/** Read the running DSH version from the installed package manifest. */
async function readDshVersion(packageRoot) {
	try {
		const raw = await readFile(join(packageRoot, "package.json"), "utf8");
		return JSON.parse(raw).version ?? "unknown";
	} catch {
		return "unknown";
	}
}

//#endregion
//#region src/inventory-service.ts
const DSH_PACKAGE_ROOT$1 = "/usr/local/lib/node_modules/@deepseek-ai/dsh";
var InventoryService = class extends TypertRemoteService {
	constructor(ctx, probeConfig) {
		super(ctx, "telemetrySeamsInventory");
		this.probeConfig = probeConfig;
		Remote(this.probe, {
			kind: "method",
			name: "probe",
			static: false,
			private: false,
			access: {
				has: () => true,
				get: () => this.probe
			},
			addInitializer: (initializer) => initializer.call(this),
			metadata: void 0
		});
	}
	async probe() {
		const dshHome = resolveDshHome(homedir());
		const env = {
			dshVersion: await readDshVersion(DSH_PACKAGE_ROOT$1),
			profile: process.env.DSH_PROFILE ?? "unknown",
			sessionId: void 0,
			dshHome,
			sessionRoot: join(dshHome, "sessions")
		};
		return buildInventory(this.ctx, this.probeConfig, env);
	}
};

//#endregion
//#region src/index.ts
const name = "telemetry-seams";
const inject = ["tools", "typert"];
const DSH_PACKAGE_ROOT = "/usr/local/lib/node_modules/@deepseek-ai/dsh";
function apply(ctx, config) {
	const probeConfig = {
		collector: config.collector,
		includeInternal: config.includeInternal
	};
	ctx.plugin(InventoryService, probeConfig);
	ctx.tools.register(defineTool({
		name: "telemetry_seams_inventory",
		description: "Discover and health-check every telemetry and information seam in this DSH deployment. Returns a structured inventory of session persistence, live session events, application logs, metrics, traces, and OTLP transport interfaces. Each seam includes its source, collection method, destination, enabled status, lifecycle state (supported/configured/operational/unavailable/unknown), and observed evidence. Use to audit what telemetry is wired vs merely configured.",
		parameters: {
			includeInternal: {
				type: "boolean",
				description: "Include seams for DSH interfaces that exist internally but are not publicly exported. Defaults to the plugin-level includeInternal setting."
			},
			forceRefresh: {
				type: "boolean",
				description: "Reserved — probes always run fresh."
			}
		},
		output: {
			schema: { type: "string" },
			render(_args, value) {
				return [{
					type: "text",
					text: value
				}];
			}
		},
		timeoutMs: 2e4,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const dshHome = resolveDshHome(homedir());
			const env = {
				dshVersion: await readDshVersion(DSH_PACKAGE_ROOT),
				profile: process.env.DSH_PROFILE ?? "unknown",
				sessionId: exec.agent?.id,
				dshHome,
				sessionRoot: join(dshHome, "sessions")
			};
			const inventory = await buildInventory(ctx, {
				collector: config.collector,
				includeInternal: args.includeInternal ?? config.includeInternal
			}, env);
			const lines = [
				"# Telemetry Seams Inventory",
				`Generated: ${inventory.generatedAt}`,
				`DSH: ${inventory.host.dshVersion} · Profile: ${inventory.host.profile}`,
				"",
				"## Collector",
				`Endpoint: ${inventory.collector.endpoint}`,
				`Reachable: ${inventory.collector.reachable}`,
				inventory.collector.uptime ? `Uptime: ${inventory.collector.uptime}` : "",
				inventory.collector.pipelines.length > 0 ? `Pipelines (${inventory.collector.pipelines.length}): ${inventory.collector.pipelines.map((p) => p.name).join(", ")}` : "Pipelines: none detected",
				"",
				`## Seams (${inventory.seams.length})`
			];
			for (const seam of inventory.seams) {
				const icon = seam.health === "operational" ? "✅" : seam.health === "configured" ? "🔵" : seam.health === "supported" ? "⚪" : seam.health === "unavailable" ? "🔴" : "❓";
				lines.push("", `### ${icon} ${seam.id}`, `Kind: ${seam.kind} · Owner: ${seam.owner} · Status: ${seam.status} · Health: ${seam.health}`, `Provides: ${seam.provides}`, `Source: ${seam.source}`, `Collection: ${seam.collection}`, `Destination: ${seam.destination}`, seam.internal ? "⚠ Internal interface (not publicly exported)" : "", seam.note ? `Note: ${seam.note}` : "", seam.evidence.length > 0 ? `Evidence: ${seam.evidence.map((e) => `${e.ok ? "✓" : "✗"} ${e.probe}: ${e.detail}`).join("; ")}` : "Evidence: none");
			}
			if (inventory.gaps.length > 0) lines.push("", "## Gaps", ...inventory.gaps.map((g) => `- ${g}`));
			lines.push("", "```json", JSON.stringify(inventory, null, 2), "```");
			return lines.filter((l) => l !== "").join("\n");
		}
	}));
}

//#endregion
export { apply, inject, name };