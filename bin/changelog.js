#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const C = require("../src");
const { c, header, plural } = require("../src/ui");
const pkg = require("../package.json");

const HELP = `${header("changelog", "CHANGELOG.md from your commits")}

${c.bold("Usage")}
  changelog                     preview unreleased changes + suggested version
  changelog --write             (re)generate CHANGELOG.md for all tags
  changelog --release           bump version, write CHANGELOG, commit + tag
  changelog --release minor     force the bump level (major | minor | patch | 1.4.0)

${c.bold("Options")}
  -o, --out <file>      output file (default CHANGELOG.md)
      --types <list>    sections to include (default feat,fix,perf,refactor,docs,revert; "all")
      --authors         add commit authors
      --stdout          print the full changelog
      --json            unreleased commits + bump as JSON
      --no-commit       with --release: write files only, no commit/tag
  -v, --version / -h, --help

Reads Conventional Commits: ${c.cyan("feat(auth): add login")}  ${c.cyan("fix!: drop node 16")}  ${c.cyan("BREAKING CHANGE: …")}`;

let a;
try { a = parseArgs({ allowPositionals: true, options: { write: { type: "boolean", short: "w" }, release: { type: "boolean", short: "r" }, out: { type: "string", short: "o", default: "CHANGELOG.md" }, types: { type: "string" }, authors: { type: "boolean" }, stdout: { type: "boolean" }, json: { type: "boolean" }, "no-commit": { type: "boolean" }, cwd: { type: "string" }, version: { type: "boolean", short: "v" }, help: { type: "boolean", short: "h" } } }); }
catch (e) { console.error(c.red(`✖ ${e.message}`)); process.exit(2); }
const o = a.values;
if (o.help) { console.log(HELP); process.exit(0); }
if (o.version) { console.log(pkg.version); process.exit(0); }
const cwd = path.resolve(o.cwd || ".");
if (!C.tryGit(cwd, ["rev-parse", "--git-dir"])) { console.error(c.red("✖ Not a git repository")); process.exit(2); }
const types = !o.types ? undefined : o.types === "all" ? Object.keys(C.TYPES) : o.types.split(",").map((s) => s.trim());

const pkgFile = path.join(cwd, "package.json");
const pj = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, "utf8")) : null;
const tagsNow = C.tags(cwd);
const current = tagsNow[0]?.name || (pj?.version ? "v" + pj.version : "v0.0.0");
const unreleased = C.log(cwd, tagsNow[0]?.name);
let next = C.bump(current, unreleased);
if (o.release && a.positionals[0]) {
  const lv = a.positionals[0];
  if (/^v?\d+\.\d+\.\d+/.test(lv)) next = { level: "manual", version: (current.startsWith("v") && !lv.startsWith("v") ? "v" : "") + lv };
  else if (["major", "minor", "patch"].includes(lv)) { const v = /^(v?)(\d+)\.(\d+)\.(\d+)/.exec(current); const [M, m, p] = [+v[2], +v[3], +v[4]]; next = { level: lv, version: v[1] + (lv === "major" ? `${M + 1}.0.0` : lv === "minor" ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`) }; }
  else { console.error(c.red(`✖ Unknown bump "${lv}" — use major, minor, patch or a version`)); process.exit(2); }
}
if (o.json) { console.log(JSON.stringify({ current, next, commits: unreleased.map(({ body, ...x }) => x) }, null, 2)); process.exit(0); }
if (o.stdout) { process.stdout.write(C.build(cwd, { types, authors: o.authors }).md); process.exit(0); }

if (o.write || o.release) {
  if (o.release && !next) { console.error(c.yellow("⚠ No commits since " + current + " — nothing to release")); process.exit(1); }
  if (o.release && C.tryGit(cwd, ["status", "--porcelain", "--untracked-files=no"]) && !o["no-commit"]) { console.error(c.red("✖ Working tree has uncommitted changes — commit or stash first")); process.exit(1); }
  const { md } = C.build(cwd, { types, authors: o.authors, unreleasedAs: o.release ? next.version : undefined });
  fs.writeFileSync(path.join(cwd, o.out), md);
  console.log(`${c.green("✔")} Wrote ${c.bold(o.out)} ${c.dim(`(${plural(tagsNow.length + (unreleased.length ? 1 : 0), "release")})`)}`);
  if (o.release) {
    if (pj) { pj.version = next.version.replace(/^v/, ""); const raw = fs.readFileSync(pkgFile, "utf8"); fs.writeFileSync(pkgFile, JSON.stringify(pj, null, /^(\s+)"/m.exec(raw)?.[1] || "  ") + "\n"); console.log(`${c.green("✔")} package.json → ${c.bold(pj.version)}`); }
    if (!o["no-commit"]) {
      C.git(cwd, ["add", o.out, ...(pj ? ["package.json"] : [])]);
      C.git(cwd, ["commit", "-q", "-m", `chore(release): ${next.version}`]);
      C.git(cwd, ["tag", "-a", next.version, "-m", next.version]);
      console.log(`${c.green("✔")} Committed + tagged ${c.bold(c.accent(next.version))}  ${c.dim("→ git push --follow-tags")}`);
    }
  }
  process.exit(0);
}

// preview
console.log(header("changelog", `${plural(unreleased.length, "commit")} since ${tagsNow[0]?.name || "the beginning"}`));
if (!unreleased.length) { console.log(`\n${c.dim("Nothing unreleased.")}`); process.exit(0); }
const by = {}; for (const x of unreleased) (by[x.type && C.TYPES[x.type] ? x.type : "other"] ??= []).push(x);
const br = unreleased.filter((x) => x.breaking);
if (br.length) { console.log(`\n${c.red(c.bold("⚠ BREAKING"))}`); for (const x of br) console.log(`  ${c.red("•")} ${x.breakingNote || x.description} ${c.dim(x.short)}`); }
for (const t of [...Object.keys(C.TYPES), "other"]) {
  if (!by[t]) continue;
  const shown = (types || ["feat", "fix", "perf", "refactor", "docs", "revert"]).includes(t);
  console.log(`\n${shown ? c.bold(C.TYPES[t] || "Other") : c.dim((C.TYPES[t] || "Other (not conventional)") + " — hidden")}`);
  for (const x of by[t].slice(0, shown ? 50 : 3)) console.log(`  ${shown ? c.accent("•") : c.dim("•")} ${x.scope ? c.cyan(x.scope + ": ") : ""}${shown ? x.description : c.dim(x.description)} ${c.dim(x.short)}`);
  if (!shown && by[t].length > 3) console.log(c.dim(`  … ${by[t].length - 3} more`));
}
console.log(`\n${c.dim("current")} ${c.bold(current)}  ${c.dim("→ next")} ${c.bold(c.green(next.version))} ${c.dim(`(${next.level})`)}\n${c.dim("Run")} ${c.cyan("changelog --release")} ${c.dim("to write CHANGELOG.md, bump package.json, commit and tag.")}`);
