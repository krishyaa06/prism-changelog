#!/bin/sh
# Repo with conventional commits + two tags: sh examples/make-demo-repo.sh /tmp/demo
set -e
D=${1:-/tmp/changelog-demo}; rm -rf "$D"; mkdir -p "$D"; cd "$D"
export GIT_AUTHOR_NAME="Soumya" GIT_AUTHOR_EMAIL="s@prism.dev" GIT_COMMITTER_NAME="Soumya" GIT_COMMITTER_EMAIL="s@prism.dev"
git init -q -b main; git remote add origin https://github.com/krishyaa06/prism-ai.git
echo '{ "name": "prism-ai", "version": "1.1.0" }' > package.json
n=0; c() { n=$((n+1)); echo "$n" >> log.txt; git add -A; GIT_AUTHOR_DATE="2026-0$1T12:00:00" GIT_COMMITTER_DATE="2026-0$1T12:00:00" git commit -q -m "$2" ${3:+-m "$3"}; }
c 7-01 "feat: initial chat UI"; c 7-03 "fix: scroll jumps on new message"; git tag -a v1.0.0 -m v1.0.0
c 8-10 "feat(models): add Groq Llama 3.3"; c 8-11 "docs: deploy guide"; c 8-12 "chore: bump deps"; git tag -a v1.1.0 -m v1.1.0
c 9-02 "feat(chat): stream responses token by token (#41)"
c 9-05 "feat(ui): dark/light theme toggle"
c 9-08 "fix(api): retry on 429 rate limits (#44)"
c 9-09 "perf: virtualize long conversations"
c 9-12 "refactor(store): move to zustand"
c 9-14 "feat(api)!: /v2 streaming endpoint" "BREAKING CHANGE: /api/chat now returns an event stream; use /api/chat?mode=json for the old format."
c 9-15 "chore: update lockfile"; c 9-16 "wip"
echo "demo repo: $D"
