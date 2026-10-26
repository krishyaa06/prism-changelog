const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const C = require("../src");
const bin = path.join(__dirname, "../bin/changelog.js");
const mk = () => { const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cl-")), "r"); execFileSync("sh", [path.join(__dirname, "../examples/make-demo-repo.sh"), d]); return d; };
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };

test("parse", () => {
  assert.deepEqual(C.parse("feat(auth)!: add sso (#12)"), { type: "feat", scope: "auth", breaking: true, description: "add sso (#12)", breakingNote: "add sso (#12)", refs: [12] });
  assert.equal(C.parse("fix: x", "BREAKING CHANGE: y\n").breakingNote, "y");
  assert.equal(C.parse("Update readme").type, null);
});
test("bump", () => {
  const f = [{ type: "feat" }], b = [{ type: "fix", breaking: true }], p = [{ type: "fix" }];
  assert.equal(C.bump("v1.2.3", f).version, "v1.3.0"); assert.equal(C.bump("1.2.3", b).version, "2.0.0");
  assert.equal(C.bump("v1.2.3", p).version, "v1.2.4"); assert.equal(C.bump("0.4.1", b).version, "0.5.0"); assert.equal(C.bump("1.0.0", []), null);
});
test("build demo", () => {
  const d = mk(); const r = C.build(d);
  assert.deepEqual(r.tags.map((t) => t.name), ["v1.1.0", "v1.0.0"]);
  assert.equal(r.unreleased.length, 8);
  assert.match(r.md, /## Unreleased\n\n### ⚠ BREAKING CHANGES\n\n- \*\*api:\*\* \/api\/chat now returns an event stream/);
  assert.match(r.md, /- \*\*chat:\*\* stream responses token by token \[#41\]\(https:\/\/github.com\/krishyaa06\/prism-ai\/issues\/41\) \(\[\w+\]\(https:\/\/github.com\/krishyaa06\/prism-ai\/commit\/\w+\)\)/);
  assert.match(r.md, /## \[1.1.0\]\(https:\/\/github.com\/krishyaa06\/prism-ai\/compare\/v1.0.0...v1.1.0\)/);
  assert.ok(!r.md.includes("bump deps"));
});
test("cli release", () => {
  const d = mk();
  const pv = spawnSync("node", [bin, "--cwd", d], { encoding: "utf8" }); assert.equal(pv.status, 0); assert.match(pv.stdout, /v2\.0\.0/);
  const r = spawnSync("node", [bin, "--cwd", d, "--release"], { encoding: "utf8", env }); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, "package.json"))).version, "2.0.0");
  assert.equal(execFileSync("git", ["describe", "--tags"], { cwd: d, encoding: "utf8" }).trim(), "v2.0.0");
  assert.match(fs.readFileSync(path.join(d, "CHANGELOG.md"), "utf8"), /## \[2.0.0\]/);
  assert.equal(spawnSync("node", [bin, "--cwd", d, "--release"], { env }).status, 1);
});
