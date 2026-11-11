import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

//#region src/capabilities.ts
const CAPABILITIES = [
	{
		id: "ruff-fix",
		label: "Ruff lint autofix",
		group: "autoCorrect",
		language: "python",
		executable: "ruff",
		description: "Fix Python lint diagnostics"
	},
	{
		id: "ruff-format",
		label: "Ruff formatter",
		group: "autoCorrect",
		language: "python",
		executable: "ruff",
		description: "Format Python files"
	},
	{
		id: "ruff-verify",
		label: "Ruff lint check",
		group: "autoCorrect",
		language: "python",
		executable: "ruff",
		description: "Verify Python lint"
	},
	{
		id: "ty",
		label: "ty",
		group: "autoCorrect",
		language: "python",
		executable: "ty",
		description: "Python type verification"
	},
	{
		id: "ty-lsp",
		label: "ty language server",
		group: "languageServer",
		language: "python",
		executable: "ty",
		description: "Python code navigation using the installed ty server"
	},
	{
		id: "rustfmt",
		label: "rustfmt",
		group: "autoCorrect",
		language: "rust",
		executable: "rustfmt",
		description: "Format Rust"
	},
	{
		id: "clippy-fix",
		label: "Clippy autofix",
		group: "autoCorrect",
		language: "rust",
		executable: "cargo-clippy",
		description: "Fix Rust lint"
	},
	{
		id: "cargo-check",
		label: "Cargo check",
		group: "autoCorrect",
		language: "rust",
		executable: "cargo",
		description: "Verify Rust compilation"
	},
	{
		id: "clippy-verify",
		label: "Clippy lint",
		group: "autoCorrect",
		language: "rust",
		executable: "cargo-clippy",
		description: "Verify Rust lint"
	},
	{
		id: "rust-analyzer",
		label: "rust-analyzer LSP",
		group: "languageServer",
		language: "rust",
		executable: "rust-analyzer",
		description: "Rust code navigation"
	},
	{
		id: "eslint-fix",
		label: "ESLint autofix",
		group: "autoCorrect",
		language: "typescript",
		executable: "eslint",
		description: "Fix TypeScript lint"
	},
	{
		id: "prettier",
		label: "Prettier",
		group: "autoCorrect",
		language: "typescript",
		executable: "prettier",
		description: "Format TypeScript"
	},
	{
		id: "eslint-verify",
		label: "ESLint lint",
		group: "autoCorrect",
		language: "typescript",
		executable: "eslint",
		description: "Verify TypeScript lint"
	},
	{
		id: "typescript-check",
		label: "TypeScript compiler",
		group: "autoCorrect",
		language: "typescript",
		executable: "tsc",
		description: "Check TypeScript types"
	},
	{
		id: "typescript-lsp",
		label: "TypeScript LSP",
		group: "languageServer",
		language: "typescript",
		executable: "typescript-language-server",
		description: "TypeScript code navigation"
	},
	{
		id: "shellcheck",
		label: "ShellCheck for staged shell scripts",
		group: "hygiene",
		executable: "shellcheck",
		description: "Validate staged shell scripts when explicitly enabled"
	},
	{
		id: "git-diff",
		label: "Git whitespace and conflict checks",
		group: "hygiene",
		executable: "git",
		description: "Check staged diff"
	},
	{
		id: "gitleaks",
		label: "Gitleaks",
		group: "hygiene",
		executable: "gitleaks",
		description: "Scan staged changes for secrets"
	},
	{
		id: "large-files",
		label: "Large-file detection",
		group: "hygiene",
		executable: "git",
		description: "Reject staged oversized blobs"
	},
	{
		id: "dependency-audit",
		label: "Dependency vulnerability scan",
		group: "hygiene",
		executable: "npm",
		description: "Optional project dependency audit"
	},
	{
		id: "license-audit",
		label: "License review",
		group: "hygiene",
		executable: "license-checker",
		description: "Optional dependency license review"
	},
	{
		id: "history-secrets",
		label: "Historical secret scan",
		group: "hygiene",
		executable: "gitleaks",
		description: "Manual historical audit"
	}
];
const LANGUAGE_EXTENSIONS = {
	python: [".py"],
	rust: [".rs"],
	typescript: [".ts", ".tsx"]
};
function languageForExtension(extension) {
	return Object.keys(LANGUAGE_EXTENSIONS).find((lang) => LANGUAGE_EXTENSIONS[lang].includes(extension));
}
/** Runtime capability admission; called by both the UI model and execution path. */
function capabilityEnabled(language, capabilityId, languages, toggles) {
	if (language === void 0 || languages[language] !== true) return false;
	return toggles[capabilityId] !== false;
}

//#endregion
//#region src/discovery.ts
const windowsSuffixes = [
	".exe",
	".cmd",
	".bat",
	""
];
function candidateFiles(directory, executable, windows) {
	return (windows ? windowsSuffixes : [""]).map((suffix) => join(directory, executable + suffix));
}
function usable(file, platform) {
	try {
		if (!statSync(file).isFile()) return false;
		accessSync(file, platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
/** Paths are checked, never executed. Explicit broken paths must not silently fall back. */
function findTool(executable, options = {}) {
	const platform = options.platform ?? process.platform;
	const windows = platform === "win32";
	if (!/^[a-zA-Z0-9_.+-]+$/.test(executable)) throw new Error("Invalid executable name");
	const explicit = options.explicit;
	if (explicit) {
		const path = resolve(explicit);
		return usable(path, platform) ? {
			path,
			status: "installed",
			source: "explicit"
		} : { status: "invalid-override" };
	}
	const dirs = [];
	if (options.prefix) {
		const root = resolve(options.prefix);
		dirs.push({
			dir: join(root, "bin"),
			source: "prefix"
		}, {
			dir: join(root, "node_modules", ".bin"),
			source: "prefix"
		}, {
			dir: join(root, "rust", "cargo", "bin"),
			source: "prefix"
		});
	}
	if (options.cwd) {
		let directory = resolve(options.cwd);
		while (true) {
			dirs.push({
				dir: join(directory, "node_modules", ".bin"),
				source: "project"
			});
			const parent = dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	}
	for (const directory of options.toolDirectories ?? []) dirs.push({
		dir: resolve(directory),
		source: "search-dir"
	}, {
		dir: resolve(directory, "bin"),
		source: "search-dir"
	}, {
		dir: resolve(directory, "node_modules", ".bin"),
		source: "search-dir"
	}, {
		dir: resolve(directory, "rust", "cargo", "bin"),
		source: "search-dir"
	});
	for (const directory of (options.path ?? process.env.PATH ?? "").split(delimiter).filter(Boolean)) dirs.push({
		dir: directory,
		source: "PATH"
	});
	for (const item of dirs) for (const path of candidateFiles(item.dir, executable, windows)) if (usable(path, platform)) return {
		path: resolve(path),
		status: "installed",
		source: item.source
	};
	return { status: "missing" };
}
function configuredToolDirectories(env = process.env) {
	return (env.ACC_TOOL_PATHS ?? "").split(delimiter).map((s) => s.trim()).filter(Boolean);
}

//#endregion
//#region src/hygiene-hook.ts
const DEFAULT_HYGIENE = [
	"git-diff",
	"gitleaks",
	"shellcheck"
];
const begin = "# BEGIN AUTO-CODE-CORRECT (managed)";
const end = "# END AUTO-CODE-CORRECT (managed)";
function git(cwd, args) {
	const run = spawnSync("git", args, {
		cwd,
		encoding: "utf8"
	});
	return run.status === 0 ? run.stdout.trim() : void 0;
}
function gitLocations(cwd) {
	const root = git(cwd, ["rev-parse", "--show-toplevel"]);
	const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]);
	if (!root || !gitDir) return void 0;
	const configured = git(root, [
		"config",
		"--get",
		"core.hooksPath"
	]);
	return {
		root,
		gitDir,
		hookDir: configured ? isAbsolute(configured) ? configured : resolve(root, configured) : join(gitDir, "hooks")
	};
}
function quoteShell(value) {
	return "'" + value.replaceAll("'", "'\\''") + "'";
}
/** Called by the native DSH post-execute listener. Idempotent and repo-local. */
function syncGitHygiene(cwd, policy) {
	const loc = gitLocations(cwd);
	if (!loc) return;
	const policyPath = join(loc.gitDir, "acc-hygiene-effective.json");
	const serialized = JSON.stringify(policy, null, 2) + "\n";
	if (!existsSync(policyPath) || readFileSync(policyPath, "utf8") !== serialized) {
		writeFileSync(policyPath, serialized, { mode: 384 });
		chmodSync(policyPath, 384);
	}
	mkdirSync(loc.hookDir, { recursive: true });
	const hook = join(loc.hookDir, "pre-commit");
	const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
	const runner = "if command -v acc-tools >/dev/null 2>&1; then\n  acc-tools hygiene || exit $?\nelse\n  " + quoteShell(process.execPath) + " " + quoteShell(cli) + " hygiene || exit $?\nfi";
	const block = begin + "\n" + runner + "\n# END AUTO-CODE-CORRECT (managed)\n";
	const existing = existsSync(hook) ? readFileSync(hook, "utf8") : "";
	if (existing.includes(begin)) {
		if (!existing.includes(end)) throw new Error("ACC Git pre-commit hook has an incomplete managed block");
		const start = existing.indexOf(begin);
		const stop = existing.indexOf(end, start) + 33;
		const updated = existing.slice(0, start) + block.trimEnd() + existing.slice(stop);
		if (updated !== existing) writeFileSync(hook, updated);
	} else if (existing) {
		if (!existing.startsWith("#!")) throw new Error("Existing pre-commit hook has no shebang; cannot safely chain ACC");
		const nl = existing.indexOf("\n");
		writeFileSync(hook, existing.slice(0, nl + 1) + block + existing.slice(nl + 1), { mode: statSync(hook).mode });
	} else writeFileSync(hook, "#!/bin/sh\n" + block, { mode: 493 });
	chmodSync(hook, statSync(hook).mode | 73);
}
function readEffectiveHygiene(cwd) {
	const loc = gitLocations(cwd);
	if (!loc) return {
		enabled: true,
		checks: [...DEFAULT_HYGIENE]
	};
	const path = join(loc.gitDir, "acc-hygiene-effective.json");
	if (!existsSync(path)) return {
		enabled: true,
		checks: [...DEFAULT_HYGIENE]
	};
	const data = JSON.parse(readFileSync(path, "utf8"));
	if (typeof data !== "object" || data === null || !("enabled" in data) || !("checks" in data)) throw new Error("Invalid generated ACC Git hygiene policy");
	const policy = data;
	if (typeof policy.enabled !== "boolean" || !Array.isArray(policy.checks) || !policy.checks.every((item) => typeof item === "string")) throw new Error("Invalid generated ACC Git hygiene policy fields");
	return policy;
}

//#endregion
export { findTool as a, languageForExtension as c, configuredToolDirectories as i, readEffectiveHygiene as n, CAPABILITIES as o, syncGitHygiene as r, capabilityEnabled as s, DEFAULT_HYGIENE as t };