import { a as findTool, c as languageForExtension, i as configuredToolDirectories, o as CAPABILITIES, r as syncGitHygiene, s as capabilityEnabled, t as DEFAULT_HYGIENE } from "./hygiene-hook-aj0RPcpF.js";
import { dirname, isAbsolute, parse, relative, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { appendPluginRecord } from "@deepseek-ai/dsh-session";

//#region src/commands.ts
const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
const actions = new Set([
	"status",
	"install",
	"uninstall",
	"link"
]);
function registerAccCommands(ctx) {
	ctx.inject(["commands", "subprocess"], (commandCtx) => {
		commandCtx.commands.register({
			name: "acc",
			description: "Inspect, install, or remove an Auto Code Correct dependency",
			input: { hint: "status|install|uninstall|link <capability-id> [installation-directory/path]" },
			handler: async ({ rawInput }) => {
				const [action = "", id = "", ...directoryParts] = rawInput.trim().split(/\s+/);
				if (!actions.has(action) || !CAPABILITIES.some((cap) => cap.id === id)) return {
					kind: "error",
					text: "Usage: /acc status|install|uninstall|link <capability-id> [installation-directory/path]"
				};
				const directory = directoryParts.join(" ");
				if (directory.includes("\0")) return {
					kind: "error",
					text: "Invalid installation directory"
				};
				if (action === "link") {
					if (!isAbsolute(directory)) return {
						kind: "error",
						text: "Link requires an absolute path to an executable."
					};
					const cap = CAPABILITIES.find((item) => item.id === id);
					const found = findTool(cap.executable, { explicit: directory });
					if (found.status !== "installed") return {
						kind: "error",
						text: "Executable not found or not executable: " + directory
					};
					const editor = commandCtx.get("configEditor");
					const entry = ctx.fiber?.entry;
					if (!editor || !entry) return {
						kind: "error",
						text: "DSH config editor unavailable; set ACC executables through profile configuration."
					};
					try {
						await editor.edit(entry, (current) => ({
							...current,
							executables: {
								...current.executables ?? {},
								[cap.executable]: found.path
							}
						}));
						return {
							kind: "success",
							text: "Linked " + cap.executable + " to " + found.path
						};
					} catch (error) {
						return {
							kind: "error",
							text: error instanceof Error ? error.message : String(error)
						};
					}
				}
				const argv = [
					process.execPath,
					cliPath,
					action,
					id,
					...directory ? ["--prefix", directory] : []
				];
				const maxBytes = 16384;
				try {
					const child = commandCtx.subprocess.spawn({
						argv,
						cwd: dirname(cliPath),
						stdio: {
							stdin: "ignore",
							stdout: { maxBytes },
							stderr: { maxBytes }
						},
						graceMs: 2e3
					});
					const result = await child.done;
					const message = [child.collected.stdout?.readFrom(0).text?.trim() ?? "", child.collected.stderr?.readFrom(0).text?.trim() ?? ""].filter(Boolean).join("\n") || `ACC ${action} ${id}: no output`;
					if (result.exitCode !== 0) return {
						kind: "error",
						text: message
					};
					return {
						kind: "success",
						text: message
					};
				} catch (error) {
					return {
						kind: "error",
						text: error instanceof Error ? error.message : String(error)
					};
				}
			}
		});
	});
}

//#endregion
//#region src/operation-record.ts
const ACC_RESULT_META_VERSION = 1;

//#endregion
//#region src/index.ts
const name = "auto-code-correct";
const inject = ["subprocess"];
const CheckerSchema = z.object({
	name: z.string().required(),
	extensions: z.array(z.string()).required(),
	argv: z.array(z.string()).required(),
	cwd: z.string().default("."),
	timeoutMs: z.number().default(3e4),
	graceMs: z.number().default(2e3),
	maxOutputBytes: z.number().default(65536),
	cleanExitCodes: z.array(z.number()).default([0]),
	streams: z.array(z.union(["stdout", "stderr"])).default(["stdout", "stderr"])
});
const Config = z.object({
	languages: z.object({
		python: z.boolean().default(true),
		rust: z.boolean().default(false),
		typescript: z.boolean().default(false)
	}).default({
		python: true,
		rust: false,
		typescript: false
	}).volatile(),
	capabilities: z.dict(z.boolean()).default({}).volatile(),
	hygieneEnabled: z.boolean().default(true).volatile(),
	languageServers: z.object({
		python: z.boolean().default(true),
		rust: z.boolean().default(true),
		typescript: z.boolean().default(true)
	}).default({
		python: true,
		rust: true,
		typescript: true
	}).volatile(),
	executables: z.dict(z.string()).default({}).volatile(),
	tools: z.array(z.string()).default([
		"write",
		"edit",
		"str_replace_editor"
	]),
	checkers: z.array(CheckerSchema).default([]),
	fixers: z.array(CheckerSchema).default([]),
	maxDiagnosticChars: z.number().default(4e3)
});
const PLUGIN_SOURCE = { kind: "auto-code-correct" };
/**
* Normalize one extension to the lowercase leading-dot form used for matching,
* so `TS`, `.TS`, and `.ts` all claim the same files.
* @param extension - extension as written in config or derived from a path.
* @returns the normalized form.
*/
function normalizeExtension(extension) {
	const lower = extension.toLowerCase();
	return lower.startsWith(".") ? lower : `.${lower}`;
}
/**
* Final extension of a path, in normalized form.
* @param filePath - path to inspect.
* @returns the extension including its dot, or an empty string when the base name has none.
*/
function extensionOf(filePath) {
	const base = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
	const dot = base.lastIndexOf(".");
	return dot > 0 ? normalizeExtension(base.slice(dot)) : "";
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
function editedPath(exec, result) {
	if (!result.isError) {
		const value = result.value;
		if (typeof value === "object" && value !== null && "path" in value) {
			const path = value.path;
			if (typeof path === "string" && path.length > 0) return path;
		}
	}
	const args = exec.arguments;
	if (typeof args !== "object" || args === null) return void 0;
	if (exec.name === "str_replace_editor") {
		if (("command" in args ? args.command : void 0) === "view") return void 0;
		const path = "path" in args ? args.path : void 0;
		if (typeof path === "string" && path.length > 0) return path;
	}
	if ("file_path" in args) {
		const filePath = args.file_path;
		if (typeof filePath === "string" && filePath.length > 0) return filePath;
	}
}
/**
* Substitute the per-run placeholders in one checker's argv.
* @param argv - the configured argument vector.
* @param filePath - absolute path of the edited file.
* @param cwd - the checker's resolved working directory.
* @returns the argv with `{file}`, `{relFile}`, and `{dir}` replaced.
*/
function substitute(argv, filePath, cwd) {
	const replacements = {
		"{file}": filePath,
		"{relFile}": relative(cwd, filePath),
		"{dir}": dirname(filePath)
	};
	return argv.map((argument) => argument.replaceAll(/\{file\}|\{relFile\}|\{dir\}/g, (match) => replacements[match]));
}
/**
* Head-truncate model-visible diagnostic text, marking what was dropped. The
* head is kept because compilers and linters emit their first errors first,
* and the first error is usually the cause of the rest.
* @param text - the concatenated findings.
* @param cap - maximum characters to keep.
* @returns the text, ellipsized with a count when it exceeds the cap.
*/
function boundText(text, cap) {
	if (text.length <= cap) return text;
	return `${text.slice(0, cap)}\n… (+${text.length - cap} more chars truncated)`;
}
/**
* Validate the load-time invariants the schema cannot express, so an unusable
* checker fails at plugin load rather than after the first edit.
* @param checkers - the schema-validated checker list.
* @throws when a checker has an empty argv, no extensions, no streams, or a non-positive bound.
*/
function validateCheckers(checkers) {
	const seen = /* @__PURE__ */ new Set();
	for (const checker of checkers) {
		const label = checker.name;
		if (label.length === 0) throw new Error("auto-code-correct: every checker needs a non-empty `name`");
		if (seen.has(label)) throw new Error(`auto-code-correct: duplicate checker name ${label}`);
		seen.add(label);
		if (checker.argv.length === 0) throw new Error(`auto-code-correct: checker ${label} has an empty \`argv\``);
		if (checker.extensions.length === 0) throw new Error(`auto-code-correct: checker ${label} claims no \`extensions\``);
		if (checker.streams.length === 0) throw new Error(`auto-code-correct: checker ${label} reads no \`streams\``);
		for (const [field, value] of [
			["timeoutMs", checker.timeoutMs],
			["graceMs", checker.graceMs],
			["maxOutputBytes", checker.maxOutputBytes]
		]) if (!Number.isInteger(value) || value < 1) throw new Error(`auto-code-correct: checker ${label} has invalid ${field} ${value} — must be an integer >= 1`);
	}
}
/**
* Install the post-edit diagnostic listener.
* @param ctx - plugin context; the listener is disposed with it.
* @param config - validated {@link Config}; checker invariants are re-checked fail-loud here.
*/
function apply(ctx, config) {
	registerAccCommands(ctx);
	validateCheckers([...config.fixers, ...config.checkers]);
	const effectiveEnabled = (extension, name$1) => {
		return capabilityEnabled(languageForExtension(extension), name$1, config.languages.get(), config.capabilities.get());
	};
	if (!Number.isInteger(config.maxDiagnosticChars) || config.maxDiagnosticChars < 1) throw new Error(`auto-code-correct: invalid maxDiagnosticChars ${config.maxDiagnosticChars} — must be an integer >= 1`);
	if (config.checkers.length === 0 && config.fixers.length === 0) console.warn("[auto-code-correct] no checkers configured; this plugin will not run anything. See its README for examples.");
	ctx.inject([
		"fs",
		"lsp",
		"subprocess"
	], async (scoped) => {
		const entries = {};
		for (const item of [
			{
				language: "python",
				id: "ty-lsp",
				command: "ty",
				args: ["server"],
				mapping: { ".py": "python" }
			},
			{
				language: "rust",
				id: "rust-analyzer",
				command: "rust-analyzer",
				args: [],
				mapping: { ".rs": "rust" }
			},
			{
				language: "typescript",
				id: "typescript-lsp",
				command: "typescript-language-server",
				args: ["--stdio"],
				mapping: {
					".ts": "typescript",
					".tsx": "typescriptreact"
				}
			}
		]) {
			if (!config.languages.get()[item.language] || !config.languageServers.get()[item.language] || config.capabilities.get()[item.id] === false) continue;
			const command = findTool(item.command, {
				explicit: config.executables.get()[item.command],
				prefix: process.env.ACC_TOOL_ROOT,
				toolDirectories: configuredToolDirectories()
			}).path ?? config.executables.get()[item.command] ?? item.command;
			try {
				await scoped.subprocess.resolveExecutable(command);
				entries[item.language] = {
					command,
					args: item.args,
					extensionToLanguage: Object.fromEntries(Object.entries(item.mapping).filter(([, v]) => typeof v === "string"))
				};
			} catch (error) {
				console.warn(`[auto-code-correct] ${item.id} unavailable; install it and reload ACC: ${errorMessage(error)}`);
			}
		}
		if (Object.keys(entries).length) {
			let nativeLspStdio;
			try {
				nativeLspStdio = await import("@deepseek-ai/dsh-lsp-stdio");
			} catch (error) {
				console.warn("[auto-code-correct] native LSP stdio could not be loaded: " + errorMessage(error));
				return;
			}
			scoped.plugin(nativeLspStdio, { servers: entries });
		}
	});
	ctx.inject([
		"fs",
		"tools",
		"subprocess"
	], async (scoped) => {
		if ([
			"lsp_diagnostics",
			"lsp_format",
			"lsp_completion",
			"lsp_code_action"
		].some((action) => scoped.tools.get(action))) {
			console.info("[auto-code-correct] existing LSP action tools detected; retaining them");
			return;
		}
		const entries = {};
		for (const option of [
			{
				language: "python",
				id: "ty-lsp",
				command: "ty",
				args: ["server"],
				mapping: { ".py": "python" },
				markers: ["pyproject.toml"]
			},
			{
				language: "rust",
				id: "rust-analyzer",
				command: "rust-analyzer",
				args: [],
				mapping: { ".rs": "rust" },
				markers: ["Cargo.toml"]
			},
			{
				language: "typescript",
				id: "typescript-lsp",
				command: "typescript-language-server",
				args: ["--stdio"],
				mapping: {
					".ts": "typescript",
					".tsx": "typescriptreact"
				},
				markers: ["tsconfig.json", "package.json"]
			}
		]) {
			if (!config.languages.get()[option.language] || !config.languageServers.get()[option.language] || config.capabilities.get()[option.id] === false) continue;
			const command = findTool(option.command, {
				explicit: config.executables.get()[option.command],
				prefix: process.env.ACC_TOOL_ROOT,
				toolDirectories: configuredToolDirectories()
			}).path ?? config.executables.get()[option.command] ?? option.command;
			try {
				await scoped.subprocess.resolveExecutable(command);
				entries[option.language] = {
					command,
					args: option.args,
					extensionToLanguage: Object.fromEntries(Object.entries(option.mapping).filter(([, v]) => typeof v === "string")),
					projectMarkers: option.markers
				};
			} catch (error) {
				console.warn(`[auto-code-correct] LSP actions for ${option.language} unavailable: ${errorMessage(error)}`);
			}
		}
		if (Object.keys(entries).length > 0) {
			let lspActions;
			try {
				lspActions = await import("dsh-lsp-actions");
			} catch (error) {
				console.warn("[auto-code-correct] LSP actions provider could not be loaded: " + errorMessage(error));
				return;
			}
			scoped.plugin(lspActions, {
				servers: entries,
				editor: { enabled: false }
			});
		}
	});
	const hygienePolicy = () => ({
		enabled: config.hygieneEnabled.get(),
		checks: [
			...DEFAULT_HYGIENE,
			"large-files",
			"dependency-audit",
			"license-audit",
			"history-secrets"
		].filter((id) => config.capabilities.get()[id] === true || config.capabilities.get()[id] !== false && DEFAULT_HYGIENE.some((value) => value === id))
	});
	try {
		syncGitHygiene(process.cwd(), hygienePolicy());
	} catch (error) {
		console.warn("[auto-code-correct] Git hygiene setup: " + errorMessage(error));
	}
	const watchedTools = new Set(config.tools);
	const byExtension = /* @__PURE__ */ new Map();
	const fixersByExtension = /* @__PURE__ */ new Map();
	for (const fixer of config.fixers) for (const extension of fixer.extensions.map(normalizeExtension)) {
		const bucket = fixersByExtension.get(extension);
		if (bucket) bucket.push(fixer);
		else fixersByExtension.set(extension, [fixer]);
	}
	for (const checker of config.checkers) for (const extension of checker.extensions.map(normalizeExtension)) {
		const bucket = byExtension.get(extension);
		if (bucket) bucket.push(checker);
		else byExtension.set(extension, [checker]);
	}
	/** Project-scoped tools must execute from the nearest actual project root. */
	function workingDirectory(filePath, checker) {
		const extension = extensionOf(filePath);
		const markers = extension === ".rs" ? ["Cargo.toml"] : extension === ".ts" || extension === ".tsx" ? checker.name === "typescript-check" ? ["tsconfig.json"] : ["package.json", "tsconfig.json"] : [];
		if (markers.length === 0) return resolve(checker.cwd);
		let dir = dirname(filePath);
		while (true) {
			if (markers.some((marker) => existsSync(resolve(dir, marker)))) return dir;
			const parent = dirname(dir);
			if (parent === dir || dir === parse(dir).root) break;
			dir = parent;
		}
		throw new Error(`no project root found for ${filePath} (expected ${markers.join(" or ")})`);
	}
	/** Run one correction or verification command and retain its complete outcome. */
	async function runOperation(kind, checker, filePath, signal) {
		const started = Date.now();
		const subprocess = ctx.subprocess;
		let cwd;
		try {
			cwd = workingDirectory(filePath, checker);
		} catch (error) {
			return {
				kind,
				name: checker.name,
				argv: [...checker.argv],
				cwd: resolve(checker.cwd),
				startedAt: started,
				durationMs: Date.now() - started,
				status: "unavailable",
				output: errorMessage(error)
			};
		}
		const argv = substitute(checker.argv, filePath, cwd);
		const requested = argv[0];
		const localExecutable = resolve(cwd, "node_modules", ".bin", requested);
		argv[0] = findTool(requested, {
			explicit: config.executables.get()[requested],
			prefix: process.env.ACC_TOOL_ROOT,
			cwd,
			toolDirectories: configuredToolDirectories()
		}).path ?? config.executables.get()[requested] ?? (existsSync(localExecutable) ? localExecutable : requested);
		let executable;
		try {
			executable = await subprocess.resolveExecutable(argv[0], void 0, signal);
			argv[0] = executable;
		} catch (error) {
			return {
				kind,
				name: checker.name,
				argv,
				cwd,
				startedAt: started,
				durationMs: Date.now() - started,
				status: signal.aborted ? "cancelled" : "unavailable",
				output: signal.aborted ? "cancelled before launch" : errorMessage(error)
			};
		}
		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(), checker.timeoutMs);
		const collect = { maxBytes: checker.maxOutputBytes };
		try {
			const handle = subprocess.spawn({
				argv,
				cwd,
				stdio: {
					stdin: "ignore",
					stdout: collect,
					stderr: collect
				},
				graceMs: checker.graceMs,
				signal: AbortSignal.any([signal, timeout.signal])
			});
			const outcome = await handle.done;
			const output = checker.streams.map((stream) => handle.collected[stream]?.readFrom(0).text ?? "").join("").trim();
			const common = {
				kind,
				name: checker.name,
				argv,
				cwd,
				startedAt: started,
				durationMs: Date.now() - started,
				exitCode: outcome.exitCode,
				signal: outcome.signal
			};
			if (timeout.signal.aborted) return {
				...common,
				status: "timeout",
				output: output || `timed out after ${checker.timeoutMs}ms`
			};
			if (signal.aborted) return {
				...common,
				status: "cancelled",
				output: output || "cancelled"
			};
			if (outcome.exitCode !== null && checker.cleanExitCodes.includes(outcome.exitCode)) return {
				...common,
				status: "clean",
				output
			};
			return {
				...common,
				status: "findings",
				output: output || `exited with code ${outcome.exitCode ?? "unknown"} without diagnostic output`
			};
		} catch (error) {
			return {
				kind,
				name: checker.name,
				argv,
				cwd,
				startedAt: started,
				durationMs: Date.now() - started,
				status: signal.aborted ? "cancelled" : "failed",
				output: signal.aborted ? "cancelled" : errorMessage(error)
			};
		} finally {
			clearTimeout(timer);
		}
	}
	/** Run every matching operation and retain both trajectory evidence and model guidance. */
	async function diagnose(filePath, signal) {
		const absolute = isAbsolute(filePath) ? filePath : resolve(filePath);
		const ext = extensionOf(absolute);
		const language = languageForExtension(ext);
		if (!language || !config.languages.get()[language]) return { operations: [] };
		const fixers = (fixersByExtension.get(ext) ?? []).filter((item) => effectiveEnabled(ext, item.name));
		const checkers = (byExtension.get(ext) ?? []).filter((item) => effectiveEnabled(ext, item.name));
		if (!fixers.length && !checkers.length) return { operations: [] };
		const operations = [];
		for (const fixer of fixers) {
			if (signal.aborted) break;
			const beforeText = readText(absolute);
			const operation = await runOperation("fixer", fixer, absolute, signal);
			const afterText = readText(absolute);
			const change = beforeText !== void 0 && afterText !== void 0 && beforeText !== afterText ? {
				path: absolute,
				beforeText,
				afterText
			} : void 0;
			operations.push(change === void 0 ? operation : {
				...operation,
				change
			});
			if (operation.status !== "clean") break;
		}
		operations.push(...await Promise.all(checkers.map((checker) => runOperation("checker", checker, absolute, signal))));
		const findings = operations.filter((operation) => operation.status !== "clean" && operation.status !== "cancelled");
		if (findings.length === 0) return { operations };
		return {
			operations,
			context: createUserMessage({
				content: [{
					type: "text",
					text: `Auto Code Correct results for ${absolute} after your edit:\n\n${boundText(findings.map((operation) => `## ${operation.name} (${operation.status})\n${operation.output}`).join("\n\n"), config.maxDiagnosticChars)}\n\nAutomatic fixes have run where configured. Address remaining findings if caused by your edit. Pre-existing findings unrelated to your change do not need to be fixed.`
				}],
				source: {
					...PLUGIN_SOURCE,
					form: "notice",
					summary: `${findings.length} ACC operation finding(s) on ${absolute.slice(absolute.lastIndexOf("/") + 1)}`
				}
			})
		};
	}
	function readText(filePath) {
		if (filePath === void 0) return void 0;
		try {
			return readFileSync(filePath, "utf8");
		} catch {
			return;
		}
	}
	function operationRecord(operation, index) {
		return {
			id: `${index}:${operation.name}`,
			kind: operation.kind,
			name: operation.name,
			argv: operation.argv,
			cwd: operation.cwd,
			startedAt: operation.startedAt,
			endedAt: operation.startedAt + operation.durationMs,
			status: operation.status,
			exitCode: operation.exitCode ?? null,
			signal: operation.signal ?? null,
			output: operation.output,
			change: operation.change ?? null
		};
	}
	const feedbackByCallId = /* @__PURE__ */ new Map();
	ctx.on("tools/execute", async (exec, next) => {
		const result = await next();
		if (!watchedTools.has(exec.name) || result.isError) return result;
		const filePath = editedPath(exec, result);
		if (filePath === void 0) return result;
		const feedback = [];
		try {
			syncGitHygiene(isAbsolute(filePath) ? dirname(filePath) : dirname(resolve(filePath)), hygienePolicy());
		} catch (error) {
			feedback.push(createUserMessage({
				content: [{
					type: "text",
					text: "ACC Git pre-commit setup failed: " + errorMessage(error)
				}],
				source: {
					...PLUGIN_SOURCE,
					form: "notice",
					summary: "ACC Git hygiene setup failure"
				}
			}));
		}
		const diagnostics = await diagnose(filePath, exec.signal);
		if (diagnostics.context) feedback.push(diagnostics.context);
		if (feedback.length > 0) feedbackByCallId.set(String(exec.callId), feedback);
		if (diagnostics.operations.length === 0) return result;
		const metadata = {
			version: ACC_RESULT_META_VERSION,
			parentCallId: String(exec.callId),
			parentToolName: exec.name,
			filePath,
			operations: diagnostics.operations.map((operation, index) => operationRecord(operation, index))
		};
		if (exec.agent?.session) appendPluginRecord(exec.agent.session, "plugin:auto-code-correct/operation", metadata);
		return result;
	});
	ctx.on("tools/post-execute", async (exec, _result, next) => {
		const downstream = await next();
		const feedback = feedbackByCallId.get(String(exec.callId));
		feedbackByCallId.delete(String(exec.callId));
		if (feedback === void 0 || feedback.length === 0 || downstream.kind === "block") return downstream;
		return {
			...downstream,
			additionalContexts: [...downstream.additionalContexts ?? [], ...feedback]
		};
	});
}
/**
* Best-effort message from an arbitrary thrown value.
* @param error - the caught value.
* @returns its message when it has one, otherwise its string form.
*/
function errorMessage(error) {
	if (error instanceof Error) return error.message;
	return String(error);
}

//#endregion
export { Config, apply, editedPath, inject, name };