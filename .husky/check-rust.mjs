/**
 * Pre-commit Rust check — runs only when .rs files are staged.
 * Cross-platform: works on Windows, macOS, and Linux.
 */
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(import.meta.url), "../..");

// Get staged .rs files
const stagedOutput = execSync("git diff --cached --name-only --diff-filter=ACM", {
  encoding: "utf-8",
});
const hasStagedRust = stagedOutput.split("\n").some((f) => f.trim().endsWith(".rs"));

if (!hasStagedRust) {
  process.exit(0);
}

const cargoCwd = path.join(root, "src-tauri");

console.log("🦀 Running cargo fmt check...");
const fmt = spawnSync("cargo", ["fmt", "--check"], { cwd: cargoCwd, stdio: "inherit" });
if (fmt.status !== 0) {
  console.error('\n❌ cargo fmt check failed. Run "cargo fmt" inside src-tauri/ and re-stage your files.');
  process.exit(1);
}

console.log("🦀 Running cargo clippy...");
const clippy = spawnSync("cargo", ["clippy", "--", "-D", "warnings"], {
  cwd: cargoCwd,
  stdio: "inherit",
});
if (clippy.status !== 0) {
  console.error("\n❌ cargo clippy found issues. Fix them and re-stage your files.");
  process.exit(1);
}

console.log("✅ Rust checks passed.");
