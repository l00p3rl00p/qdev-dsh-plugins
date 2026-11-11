window.__ModuleLoader__.load({ id: "dsh-auto-code-correct", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

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

//#endregion
//#region src/operation-record.ts
const ACC_RESULT_META_VERSION = 1;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Validate untrusted durable metadata before a future native presentation reads it. */
function isAccResultMeta(value) {
	if (!isRecord(value)) return false;
	if (value.version !== ACC_RESULT_META_VERSION || typeof value.parentCallId !== "string" || typeof value.parentToolName !== "string" || typeof value.filePath !== "string" || !Array.isArray(value.operations)) return false;
	return value.operations.every((operation) => isRecord(operation) && typeof operation.id === "string" && (operation.kind === "fixer" || operation.kind === "checker") && typeof operation.name === "string" && Array.isArray(operation.argv) && operation.argv.every((argument) => typeof argument === "string") && typeof operation.cwd === "string" && typeof operation.startedAt === "number" && typeof operation.endedAt === "number" && [
		"clean",
		"findings",
		"failed",
		"unavailable",
		"timeout",
		"cancelled"
	].includes(String(operation.status)) && (typeof operation.exitCode === "number" || operation.exitCode === null) && (typeof operation.signal === "string" || operation.signal === null) && typeof operation.output === "string" && (operation.change === null || isRecord(operation.change) && typeof operation.change.path === "string" && typeof operation.change.beforeText === "string" && typeof operation.change.afterText === "string"));
}

//#endregion
//#region src/client/autocorrect-view.tsx
function metaFromEvent(event) {
	if (typeof event !== "object" || event === null || !("type" in event)) return void 0;
	if (event.type === "plugin:auto-code-correct/operation" || event.type === "auto-code-correct/operation") {
		const data$1 = event.data;
		return isAccResultMeta(data$1) ? data$1 : void 0;
	}
	if (event.type !== "tool/result") return void 0;
	const data = event.data;
	if (typeof data !== "object" || data === null || !("meta" in data)) return void 0;
	const meta = data.meta;
	if (typeof meta !== "object" || meta === null || !("autoCodeCorrect" in meta)) return void 0;
	const value = meta.autoCodeCorrect;
	return isAccResultMeta(value) ? value : void 0;
}
var AutoCorrectViewBuilder = class {
	empty = [];
	nodes = /* @__PURE__ */ new Map();
	replace(input) {
		this.nodes = new Map(input.nodes.filter((node) => isAccResultMeta(node.data)).map((node) => [node.key, node]));
		return [...this.nodes.values()];
	}
	apply(input) {
		for (const node of input.upserts) if (isAccResultMeta(node.data)) this.nodes.set(node.key, node);
		return [...this.nodes.values()];
	}
};
/**
* Parse tool output to extract structured issues.
* Supports: ruff, ty, eslint, tsc, clippy, rustfmt
*/
function parseIssues(operation) {
	const issues = [];
	const lines = operation.output.split("\n");
	for (const line of lines) {
		const ruffMatch = line.match(/^[^:]+:(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)$/);
		if (ruffMatch) {
			issues.push({
				line: parseInt(ruffMatch[1], 10),
				column: parseInt(ruffMatch[2], 10),
				code: ruffMatch[3],
				severity: ruffMatch[3].startsWith("E") ? "error" : "warning",
				message: ruffMatch[4],
				fixed: operation.kind === "fixer" && operation.status === "clean"
			});
			continue;
		}
		const tyMatch = line.match(/^[^:]+:(\d+):\s+(error|warning|note):\s+(.+)$/);
		if (tyMatch) {
			issues.push({
				line: parseInt(tyMatch[1], 10),
				severity: tyMatch[2] === "error" ? "error" : tyMatch[2] === "warning" ? "warning" : "info",
				message: tyMatch[3],
				fixed: false
			});
			continue;
		}
		const eslintMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2}(.+)$/);
		if (eslintMatch) {
			issues.push({
				line: parseInt(eslintMatch[1], 10),
				column: parseInt(eslintMatch[2], 10),
				code: eslintMatch[5],
				severity: eslintMatch[3] === "error" ? "error" : "warning",
				message: eslintMatch[4],
				fixed: operation.kind === "fixer" && operation.status === "clean"
			});
			continue;
		}
	}
	return issues;
}
function computeSummary(rows) {
	let totalFiles = 0;
	let totalOperations = 0;
	let totalFixed = 0;
	let totalFindings = 0;
	let totalDuration = 0;
	const toolsUsed = /* @__PURE__ */ new Set();
	for (const row of rows) {
		totalFiles++;
		for (const operation of row.data.operations) {
			totalOperations++;
			toolsUsed.add(operation.name);
			totalDuration += operation.endedAt - operation.startedAt;
			const issues = parseIssues(operation);
			const fixed = issues.filter((i) => i.fixed).length;
			const findings = issues.filter((i) => !i.fixed).length;
			if (operation.kind === "fixer" && operation.status === "clean" && issues.length > 0) totalFixed += fixed;
			if (operation.status === "findings") totalFindings += findings > 0 ? findings : 1;
		}
	}
	return {
		totalFiles,
		totalOperations,
		totalFixed,
		totalFindings,
		totalDuration,
		toolsUsed
	};
}
function categorizeIssues(rows) {
	const byCategory = /* @__PURE__ */ new Map();
	for (const row of rows) for (const operation of row.data.operations) {
		const issues = parseIssues(operation);
		for (const issue of issues) {
			const category = issue.code?.startsWith("E") || issue.code?.startsWith("F") ? "Formatting" : issue.severity === "error" ? "Errors" : "Warnings";
			if (!byCategory.has(category)) byCategory.set(category, /* @__PURE__ */ new Map());
			const categoryMap = byCategory.get(category);
			const key = issue.code || issue.message;
			const existing = categoryMap.get(key) || {
				message: issue.message,
				count: 0,
				fixed: 0
			};
			existing.count++;
			if (issue.fixed) existing.fixed++;
			categoryMap.set(key, existing);
		}
	}
	return Array.from(byCategory.entries()).map(([category, issuesMap]) => ({
		category,
		issues: Array.from(issuesMap.entries()).map(([code, data]) => ({
			code,
			...data
		})).sort((a, b) => b.count - a.count)
	}));
}
const pageStyle$1 = {
	display: "flex",
	flexDirection: "column",
	gap: 12,
	padding: 16,
	overflow: "auto"
};
const summaryCardStyle = {
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 12,
	background: "var(--dsw-alias-bg-module-highlight)",
	padding: "12px 16px",
	display: "flex",
	gap: 16,
	flexWrap: "wrap",
	alignItems: "center"
};
const cardStyle$1 = {
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 12,
	background: "var(--dsw-alias-bg-module-platform)",
	padding: "14px 16px"
};
const statStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 2
};
const statLabelStyle = {
	color: "var(--dsw-alias-label-secondary)",
	fontSize: 12,
	lineHeight: "18px"
};
const statValueStyle = {
	color: "var(--dsw-alias-label-primary)",
	fontSize: 20,
	lineHeight: "24px",
	fontWeight: 600
};
const mutedStyle = {
	color: "var(--dsw-alias-label-secondary)",
	fontSize: 13,
	lineHeight: "20px"
};
const labelStyle$1 = {
	color: "var(--dsw-alias-label-primary)",
	fontSize: 14,
	lineHeight: "20px",
	fontWeight: 500
};
const headerStyle = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginBottom: 8
};
const buttonStyle = {
	padding: "4px 8px",
	fontSize: 12,
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 6,
	background: "var(--dsw-alias-bg-module-platform)",
	color: "var(--dsw-alias-label-primary)",
	cursor: "pointer"
};
function SessionSummaryCard({ summary }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		style: summaryCardStyle,
		"aria-label": "Session summary",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: statStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: statLabelStyle,
					children: "Files"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: statValueStyle,
					children: summary.totalFiles
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: statStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: statLabelStyle,
					children: "Fixed"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						...statValueStyle,
						color: "var(--dsw-alias-state-success-primary)"
					},
					children: summary.totalFixed
				})]
			}),
			summary.totalFindings > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: statStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: statLabelStyle,
					children: "Remaining"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						...statValueStyle,
						color: "var(--dsw-alias-state-warning-primary)"
					},
					children: summary.totalFindings
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: statStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: statLabelStyle,
					children: "Duration"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: statValueStyle,
					children: [(summary.totalDuration / 1e3).toFixed(1), "s"]
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					flex: 1,
					minWidth: 200
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: statLabelStyle,
					children: "Tools: "
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: mutedStyle,
					children: Array.from(summary.toolsUsed).join(", ")
				})]
			})
		]
	});
}
function IssueCategoriesCard({ categories }) {
	if (categories.length === 0 || categories.every((cat) => cat.issues.length === 0)) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		style: cardStyle$1,
		"aria-label": "Issue categories",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
			style: labelStyle$1,
			children: "Issues by Category"
		}), categories.map((category) => category.issues.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: { marginTop: 12 },
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
				style: mutedStyle,
				children: category.category
			}), category.issues.slice(0, 5).map((issue) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...mutedStyle,
					marginLeft: 16,
					marginTop: 4
				},
				children: [
					issue.fixed > 0 ? "✓" : "⚠",
					" ",
					issue.code,
					": ",
					issue.message,
					" ",
					issue.count > 1 && `(×${issue.count})`,
					issue.fixed > 0 && issue.fixed < issue.count && ` - ${issue.fixed} fixed`
				]
			}, issue.code))]
		}, category.category))]
	});
}
function DiffViewer({ beforeText, afterText }) {
	const lines = (0, react.useMemo)(() => {
		const before = beforeText.split("\n");
		const after = afterText.split("\n");
		const maxLen = Math.max(before.length, after.length);
		const diffs = [];
		for (let i = 0; i < maxLen; i++) {
			const b = before[i];
			const a = after[i];
			if (b !== a) diffs.push({
				line: i + 1,
				before: b,
				after: a,
				changed: true
			});
		}
		return diffs.slice(0, 10);
	}, [beforeText, afterText]);
	if (lines.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		style: mutedStyle,
		children: "No changes detected"
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: { marginTop: 8 },
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
			style: {
				...mutedStyle,
				whiteSpace: "pre-wrap",
				background: "var(--dsw-alias-bg-layer-1)",
				padding: 8,
				borderRadius: 6,
				margin: 0
			},
			children: lines.map((diff) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [diff.before !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { color: "var(--dsw-alias-state-error-primary)" },
				children: ["- ", diff.before]
			}), diff.after !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { color: "var(--dsw-alias-state-success-primary)" },
				children: ["+ ", diff.after]
			})] }, diff.line))
		})
	});
}
function FileOperationCard({ row }) {
	const [expanded, setExpanded] = (0, react.useState)(false);
	const summary = (0, react.useMemo)(() => {
		let fixed = 0;
		let findings = 0;
		for (const op of row.data.operations) {
			const issues = parseIssues(op);
			fixed += issues.filter((i) => i.fixed).length;
			findings += issues.filter((i) => !i.fixed && op.status === "findings").length;
		}
		return {
			fixed,
			findings
		};
	}, [row.data.operations]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		style: cardStyle$1,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			style: headerStyle,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", {
				style: labelStyle$1,
				children: ["📄 ", row.data.filePath]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				style: mutedStyle,
				children: [
					"via ",
					row.data.parentToolName,
					" · ",
					row.data.operations.length,
					" operation(s)",
					summary.fixed > 0 && ` · ${summary.fixed} fixed`,
					summary.findings > 0 && ` · ${summary.findings} remaining`
				]
			})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: buttonStyle,
				onClick: () => setExpanded(!expanded),
				children: expanded ? "Collapse ▲" : "Expand ▼"
			})]
		}), expanded && row.data.operations.map((operation) => {
			const issues = parseIssues(operation);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					borderTop: "1px solid var(--dsw-alias-border-l2)",
					paddingTop: 8,
					marginTop: 8
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: headerStyle,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
							operation.status === "clean" ? "✓" : operation.status === "findings" ? "⚠" : "✗",
							" ",
							operation.name
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: mutedStyle,
							children: [
								" ",
								"· ",
								operation.kind,
								" · ",
								operation.status,
								" · ",
								operation.endedAt - operation.startedAt,
								"ms"
							]
						})] })
					}),
					issues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { marginTop: 8 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: mutedStyle,
								children: [issues.filter((i) => i.fixed).length > 0 && `Fixed ${issues.filter((i) => i.fixed).length} issues`, issues.filter((i) => !i.fixed).length > 0 && ` · ${issues.filter((i) => !i.fixed).length} remaining`]
							}),
							issues.slice(0, 3).map((issue, idx) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...mutedStyle,
									marginLeft: 16,
									marginTop: 4
								},
								children: [
									issue.fixed ? "✓" : "⚠",
									" Line ",
									issue.line,
									": ",
									issue.code && `${issue.code} - `,
									issue.message
								]
							}, idx)),
							issues.length > 3 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: mutedStyle,
								children: [
									"... and ",
									issues.length - 3,
									" more"
								]
							})
						]
					}),
					operation.change && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						style: { marginTop: 8 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
							style: {
								...mutedStyle,
								cursor: "pointer"
							},
							children: "View diff"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiffViewer, {
							beforeText: operation.change.beforeText,
							afterText: operation.change.afterText
						})]
					}),
					operation.output && issues.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("pre", {
						style: {
							...mutedStyle,
							whiteSpace: "pre-wrap",
							margin: "8px 0 0",
							fontSize: 12
						},
						children: [operation.output.slice(0, 500), operation.output.length > 500 && "..."]
					})
				]
			}, operation.id);
		})]
	}, row.key);
}
function AutoCorrectView(props) {
	const rows = (0, react.useSyncExternalStore)(props.useAutoCodeCorrect.subscribe, props.useAutoCodeCorrect.getSnapshot, props.useAutoCodeCorrect.getSnapshot);
	const summary = (0, react.useMemo)(() => computeSummary(rows), [rows]);
	const categories = (0, react.useMemo)(() => categorizeIssues(rows), [rows]);
	if (rows.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
		style: pageStyle$1,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
			style: cardStyle$1,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: labelStyle$1,
					children: "📝 AutoCorrect"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: mutedStyle,
					children: "Automatic code correction results will appear here."
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: mutedStyle,
					children: [
						"When you edit files, ACC will:",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
						"• Fix formatting issues automatically",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
						"• Run linters and type checkers",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
						"• Show what was corrected"
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: mutedStyle,
					children: "No operations recorded in this session yet."
				})
			]
		})
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
		style: pageStyle$1,
		"aria-label": "AutoCorrect operations",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionSummaryCard, { summary }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IssueCategoriesCard, { categories }),
			rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileOperationCard, { row }, row.key))
		]
	});
}
/** Register an ACC-owned session view; it projects only ACC's durable result metadata. */
function registerAutoCorrectView(ctx) {
	const target = "auto-code-correct";
	ctx.uiConversation.views.register({
		target,
		create: () => new AutoCorrectViewBuilder(),
		isActive: () => true
	});
	ctx.uiConversation.events.register({
		kind: "auto-code-correct",
		target,
		match: {
			"plugin:auto-code-correct/operation": (event) => {
				const metadata = metaFromEvent(event);
				return metadata === void 0 ? null : {
					id: metadata.parentCallId,
					role: "start"
				};
			},
			"tool/result": (event) => {
				const metadata = metaFromEvent(event);
				return metadata === void 0 ? null : {
					id: metadata.parentCallId,
					role: "start"
				};
			}
		},
		start: (_context, match) => metaFromEvent(match.event),
		update: (context) => context.state,
		buildViewNode: (context) => ({
			key: context.key,
			kind: "auto-code-correct",
			id: context.id,
			target,
			data: context.state
		})
	});
	ctx.slots.inject("conversation.view", () => ctx.slots.register({
		name: "conversation.view",
		id: target,
		order: 20,
		label: () => "AutoCorrect",
		inject: (sessionId) => ({ useAutoCodeCorrect: ctx.uiConversation.binding(sessionId).target(target) })
	}, AutoCorrectView));
}

//#endregion
//#region src/client/index.tsx
const FALLBACK_LANGUAGES = {
	python: true,
	rust: false,
	typescript: false
};
const FALLBACK_SERVERS = {
	python: true,
	rust: true,
	typescript: true
};
const LABELS = {
	python: "Python",
	rust: "Rust",
	typescript: "TypeScript"
};
const LANGUAGE_HINTS = {
	python: "Run Python correction, verification, and language-server tools.",
	rust: "Run Rust formatting, lint, build-check, and language-server tools.",
	typescript: "Run TypeScript formatting, lint, type-check, and language-server tools."
};
const DEFAULT_HYGIENE = [
	"git-diff",
	"gitleaks",
	"shellcheck"
];
const pageStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 16
};
const cardStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 0,
	padding: "16px 18px",
	border: "1px solid var(--dsw-alias-border-l2)",
	borderRadius: 12,
	background: "var(--dsw-alias-bg-module-platform)"
};
const titleStyle = {
	margin: 0,
	color: "var(--dsw-alias-label-primary)",
	fontSize: 14,
	lineHeight: "20px",
	fontWeight: 600
};
const groupStyle = {
	margin: "12px 0 2px",
	color: "var(--dsw-alias-label-secondary)",
	fontSize: 12,
	lineHeight: "18px",
	fontWeight: 600
};
const hintStyle = {
	margin: "4px 0 8px",
	color: "var(--dsw-alias-label-secondary)",
	fontSize: 13,
	lineHeight: "20px"
};
const rowStyle = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "flex-start",
	gap: 16,
	padding: "8px 0"
};
const copyStyle = {
	display: "flex",
	minWidth: 0,
	flexDirection: "column",
	gap: 3
};
const labelStyle = {
	color: "var(--dsw-alias-label-primary)",
	fontSize: 14,
	lineHeight: "20px",
	fontWeight: 500
};
const descriptionStyle = {
	color: "var(--dsw-alias-label-secondary)",
	fontSize: 13,
	lineHeight: "20px"
};
const inject = [
	"slots",
	"configForms",
	"uiConversation"
];
const name = "auto-code-correct-settings";
function createPluginPage(scope) {
	const subscribe = (listener) => scope.subscribe(listener);
	const getSnapshot = () => scope.getSnapshot();
	const mutate = scope.mutate.bind(scope);
	return function PluginPage({ view }) {
		const state = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
		if (view === "summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Language gates, autofix, verification, and Git hygiene." });
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigPage, { form: {
			state,
			mutate
		} });
	};
}
function PreferenceToggle({ label, checked, disabled, onChange }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		role: "switch",
		"aria-label": label,
		"aria-checked": checked,
		disabled,
		onClick: () => onChange(!checked),
		style: {
			position: "relative",
			width: 40,
			height: 22,
			flex: "0 0 auto",
			marginTop: 1,
			padding: 0,
			border: 0,
			borderRadius: 999,
			background: checked ? "var(--dsw-alias-button-primary-fill)" : "var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.24))",
			cursor: disabled ? "not-allowed" : "pointer",
			opacity: disabled ? .5 : 1,
			transition: "background 120ms ease, opacity 120ms ease"
		},
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			"aria-hidden": "true",
			style: {
				position: "absolute",
				top: 3,
				left: checked ? 21 : 3,
				width: 16,
				height: 16,
				borderRadius: "50%",
				background: "var(--dsw-alias-label-primary-foreground, #fff)",
				boxShadow: "0 1px 2px rgba(0, 0, 0, 0.22)",
				transition: "left 120ms ease"
			}
		})
	});
}
function ConfigPage({ form }) {
	const snapshot = form.state;
	const [working, setWorking] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)("");
	const value = snapshot.value ?? {};
	const languages = {
		...FALLBACK_LANGUAGES,
		...value.languages
	};
	const capabilities = value.capabilities ?? {};
	const servers = {
		...FALLBACK_SERVERS,
		...value.languageServers
	};
	async function change(path, next) {
		if (snapshot.status !== "ready" || !snapshot.writable) return;
		setWorking(path.join("."));
		setError("");
		try {
			if (!await form.mutate([{
				op: "set",
				path,
				value: next
			}], snapshot.revision)) setError("The setting changed elsewhere. Review the refreshed value and try again.");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setWorking(null);
		}
	}
	const switchRow = (id, label, description, enabled, path, disabled = false) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		style: rowStyle,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			style: copyStyle,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: labelStyle,
				children: label
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				style: descriptionStyle,
				children: description
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferenceToggle, {
			label,
			checked: enabled,
			disabled: disabled || working !== null || !snapshot.writable,
			onChange: (next) => void change(path, next)
		})]
	}, id);
	const languagePanels = Object.keys(LABELS).map((lang) => {
		const enabled = languages[lang];
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
			style: cardStyle,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: titleStyle,
					children: LABELS[lang]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: hintStyle,
					children: LANGUAGE_HINTS[lang]
				}),
				switchRow(`${lang}-enabled`, `Enable ${LABELS[lang]}`, `Master switch for every ${LABELS[lang]} correction, check, and language-server operation.`, enabled, ["languages", lang]),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					style: groupStyle,
					children: "Automatic correction and verification"
				}),
				CAPABILITIES.filter((cap) => cap.language === lang && cap.group === "autoCorrect").map((cap) => switchRow(cap.id, cap.label, `${cap.description}. Uses the existing ${cap.executable} executable.`, capabilities[cap.id] !== false, ["capabilities", cap.id], !enabled)),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
					style: groupStyle,
					children: "Language server"
				}),
				switchRow(`${lang}-language-server`, `Enable ${LABELS[lang]} language server`, "Controls native DSH diagnostics, formatting, code actions, symbols, completion, and navigation.", servers[lang], ["languageServers", lang], !enabled),
				CAPABILITIES.filter((cap) => cap.language === lang && cap.group === "languageServer").map((cap) => switchRow(cap.id, cap.label, `${cap.description}. Uses the existing ${cap.executable} executable.`, capabilities[cap.id] !== false, ["capabilities", cap.id], !enabled || !servers[lang]))
			]
		}, lang);
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
		style: pageStyle,
		children: [
			snapshot.status !== "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				style: hintStyle,
				children: [
					"Settings are ",
					snapshot.status,
					"."
				]
			}) : null,
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "alert",
				style: {
					...hintStyle,
					color: "var(--dsw-alias-state-error-primary)"
				},
				children: error
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: titleStyle,
					children: "Languages and tools"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: hintStyle,
					children: "Changes save immediately through DSH ConfigForms and persist in the active profile after reload or restart."
				})]
			}),
			languagePanels,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: cardStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: titleStyle,
						children: "Repository hygiene"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: hintStyle,
						children: "Run the enabled checks from ACC's chained pre-commit hook."
					}),
					switchRow("hygieneEnabled", "Enable automatic Git pre-commit hygiene", "Master switch for staged-change checks. Existing repository hooks are preserved and run afterward.", value.hygieneEnabled !== false, ["hygieneEnabled"]),
					CAPABILITIES.filter((cap) => cap.group === "hygiene").map((cap) => switchRow(cap.id, cap.label, `${cap.description}. Uses ${cap.executable}${DEFAULT_HYGIENE.includes(cap.id) ? " and is enabled by default" : "; optional checks can block a commit when selected"}.`, capabilities[cap.id] === true || capabilities[cap.id] === void 0 && DEFAULT_HYGIENE.includes(cap.id), ["capabilities", cap.id], value.hygieneEnabled === false))
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: cardStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: titleStyle,
					children: "Tool resolution"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					style: {
						...hintStyle,
						marginBottom: 0
					},
					children: [
						"ACC reuses project-local tools and executables already available to DSH. A toggle never installs or removes software. Use ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "/acc status <capability-id>" }),
						" to inspect availability and",
						" ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "/acc link <capability-id> /absolute/path" }),
						" to save an existing executable path."
					]
				})]
			})
		]
	});
}
function apply(ctx) {
	registerAutoCorrectView(ctx);
	ctx.effect(() => ctx.configForms.whileServed(["auto-code-correct"], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
		name: "plugins.bundle.config",
		key: "dsh-auto-code-correct"
	}, createPluginPage(ctx.configForms.get("auto-code-correct"))))), "auto-code-correct: plugin detail configuration");
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });