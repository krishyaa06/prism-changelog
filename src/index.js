"use strict";
const { execFileSync } = require("node:child_process");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 }).trimEnd();
const tryGit = (cwd, args) => { try { return git(cwd, args); } catch { return ""; } };

const TYPES = { feat: "✨ Features", fix: "🐛 Bug Fixes", perf: "⚡ Performance", refactor: "♻️ Refactoring", docs: "📝 Documentation", style: "💄 Styling", test: "✅ Tests", build: "📦 Build", ci: "👷 CI", chore: "🔧 Chores", revert: "⏪ Reverts" };
const DEFAULT_SHOWN = ["feat", "fix", "perf", "refactor", "docs", "revert"];

/** Parse a conventional commit subject + body. */
function parse(subject, body = "") {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/.exec(subject.trim());
  const breakingNote = /^BREAKING[ -]CHANGE:\s*([\s\S]+?)(?:\n\n|$)/m.exec(body);
  if (!m) return { type: null, scope: null, breaking: !!breakingNote, description: subject.trim(), breakingNote: breakingNote?.[1].trim() || null, refs: refs(subject + " " + body) };
  return { type: m[1].toLowerCase(), scope: m[2] || null, breaking: !!m[3] || !!breakingNote, description: m[4].trim(), breakingNote: breakingNote?.[1].trim() || (m[3] ? m[4].trim() : null), refs: refs(subject + " " + body) };
}
const refs = (s) => [...new Set([...s.matchAll(/(?:^|[\s(])#(\d+)\b/g)].map((m) => +m[1]))];

function log(cwd, from, to = "HEAD") {
  const range = from ? `${from}..${to}` : to;
  const out = tryGit(cwd, ["log", range, "--no-merges", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f%b%x1e"]);
  return out.split("\x1e").map((x) => x.trim()).filter(Boolean).map((x) => { const [hash, short, author, date, subject, body] = x.split("\x1f"); return { hash, short, author, date, subject, body: body || "", ...parse(subject, body) }; });
}
function tags(cwd) {
  return tryGit(cwd, ["tag", "--list", "--sort=-v:refname", "--format=%(refname:short)\x1f%(creatordate:short)"]).split("\n").filter(Boolean).map((l) => { const [name, date] = l.split("\x1f"); return { name, date }; }).filter((t) => /^v?\d+\.\d+\.\d+/.test(t.name));
}
function bump(version, commits) {
  const v = /^(v?)(\d+)\.(\d+)\.(\d+)/.exec(version || "0.0.0"); if (!v) return null;
  let [, pre, M, m, p] = v; M = +M; m = +m; p = +p;
  const level = commits.some((c) => c.breaking) ? "major" : commits.some((c) => c.type === "feat") ? "minor" : commits.length ? "patch" : null;
  if (!level) return null;
  if (level === "major" && M === 0) return { level: "minor (0.x breaking)", version: `${pre}0.${m + 1}.0` };
  return { level, version: level === "major" ? `${pre}${M + 1}.0.0` : level === "minor" ? `${pre}${M}.${m + 1}.0` : `${pre}${M}.${m}.${p + 1}` };
}
function repoUrl(cwd) {
  const u = tryGit(cwd, ["config", "--get", "remote.origin.url"]); if (!u) return null;
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(u) || /gitlab\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(u);
  return m ? `https://${u.includes("gitlab") ? "gitlab" : "github"}.com/${m[1]}/${m[2]}` : null;
}
/** Group commits into a release section. */
function section(commits, { version, date, prevTag, url, types = DEFAULT_SHOWN, authors = false } = {}) {
  const title = version ? (url && prevTag ? `[${version.replace(/^v/, "")}](${url}/compare/${prevTag}...${version})` : version.replace(/^v/, "")) : "Unreleased";
  let md = `## ${title}${date ? ` (${date})` : ""}\n`;
  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) md += `\n### ⚠ BREAKING CHANGES\n\n${breaking.map((c) => `- ${c.scope ? `**${c.scope}:** ` : ""}${c.breakingNote || c.description}`).join("\n")}\n`;
  const groups = {};
  for (const c of commits) { const t = c.type && TYPES[c.type] ? c.type : null; if (!t || !types.includes(t)) continue; (groups[t] ??= []).push(c); }
  for (const t of Object.keys(TYPES)) {
    if (!groups[t]) continue;
    md += `\n### ${TYPES[t]}\n\n`;
    const byScope = groups[t].sort((a, b) => (a.scope || "~").localeCompare(b.scope || "~"));
    for (const c of byScope) {
      const link = url ? `([${c.short}](${url}/commit/${c.hash}))` : `(${c.short})`;
      const r = c.refs.length ? " " + c.refs.map((n) => (url ? `[#${n}](${url}/issues/${n})` : `#${n}`)).join(", ") : "";
      md += `- ${c.scope ? `**${c.scope}:** ` : ""}${c.description.replace(/\s*\(#\d+\)$/, "")}${r} ${link}${authors ? ` — ${c.author}` : ""}\n`;
    }
  }
  const other = commits.filter((c) => !c.type).length;
  if (!Object.keys(groups).length && !breaking.length) md += `\n_No notable changes${other ? ` (${other} non-conventional commit${other > 1 ? "s" : ""})` : ""}._\n`;
  return md;
}
/** Build full changelog: one section per tag + Unreleased. */
function build(cwd, { unreleasedAs, types, authors, all = true, today = new Date().toISOString().slice(0, 10) } = {}) {
  const url = repoUrl(cwd), ts = tags(cwd);
  const parts = [];
  const head = log(cwd, ts[0]?.name);
  if (head.length) parts.push({ commits: head, md: section(head, { version: unreleasedAs, date: unreleasedAs ? today : null, prevTag: ts[0]?.name, url, types, authors }) });
  const list = all ? ts : [];
  list.forEach((t, i) => { const c = log(cwd, list[i + 1]?.name, t.name); parts.push({ commits: c, md: section(c, { version: t.name, date: t.date, prevTag: list[i + 1]?.name, url, types, authors }) }); });
  return { md: "# Changelog\n\nAll notable changes to this project are documented here. Generated from [Conventional Commits](https://www.conventionalcommits.org).\n\n" + parts.map((p) => p.md).join("\n"), unreleased: head, tags: ts, url };
}
module.exports = { parse, log, tags, bump, section, build, repoUrl, TYPES, git, tryGit };
