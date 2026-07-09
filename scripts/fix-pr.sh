#!/usr/bin/env bash
# Autonomous "Fix with Claude" job for the PR Widget.
# Checks out a PR's branch into a cached working clone, runs a headless Claude
# session to fix the failing/missing CI checks, and pushes the update back to
# the same branch. Invoked detached by the widget's main process.
#
# Args: OWNER REPO NUMBER [ACCOUNT]
set -uo pipefail

OWNER="${1:?owner required}"
REPO="${2:?repo required}"
NUMBER="${3:?number required}"
ACCOUNT="${4:-}"

ROOT="$HOME/.pr-widget/work"
WORK="$ROOT/${OWNER}-${REPO}"
mkdir -p "$ROOT"

# A detached GUI-spawned bash inherits a sparse PATH: make sure Homebrew (gh)
# and the nvm-installed `claude`/node bins are resolvable.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
if ! command -v claude >/dev/null 2>&1; then
  for d in "$NVM_DIR"/versions/node/*/bin; do PATH="$d:$PATH"; done
  export PATH
fi
for bin in gh claude git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: '$bin' not found on PATH"; exit 127; }
done

echo "=== fix start $(date) — PR #$NUMBER $OWNER/$REPO (account: ${ACCOUNT:-active}) ==="

# Authenticate git AND gh via the account's token, embedded in the remote URL.
# This bypasses the machine's global credential helper (which is pinned to a
# specific gh user and would otherwise hijack the clone/push), and is
# concurrency-safe — no `gh auth switch` mutating global state.
if [ -n "$ACCOUNT" ]; then
  TOKEN="$(gh auth token --user "$ACCOUNT" 2>/dev/null)"
else
  TOKEN="$(gh auth token 2>/dev/null)"
fi
[ -n "$TOKEN" ] || { echo "FATAL: could not read gh token for ${ACCOUNT:-active account}"; exit 1; }
export GH_TOKEN="$TOKEN"
AUTH_URL="https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git"

# Cached clone: clone once (token-authed), then reuse on later runs.
if [ ! -d "$WORK/.git" ]; then
  echo "--- cloning $OWNER/$REPO ---"
  git clone "$AUTH_URL" "$WORK" || { echo "clone failed"; exit 1; }
fi
cd "$WORK" || { echo "cannot enter $WORK"; exit 1; }
git remote set-url origin "$AUTH_URL"           # ensure fetch/push use the token
GIT_USER="${ACCOUNT:-$(gh api user --jq .login 2>/dev/null)}"
GIT_USER="${GIT_USER:-pr-widget}"
git config user.name "$GIT_USER"
git config user.email "${GIT_USER}@users.noreply.github.com"

HEAD_BRANCH="$(gh pr view "$NUMBER" --repo "$OWNER/$REPO" --json headRefName -q .headRefName 2>/dev/null)"
[ -n "$HEAD_BRANCH" ] || { echo "could not resolve head branch for PR #$NUMBER"; exit 1; }
echo "--- checking out $HEAD_BRANCH (PR #$NUMBER) ---"
git fetch origin "$HEAD_BRANCH" || { echo "fetch failed"; exit 1; }
git checkout -B "$HEAD_BRANCH" "origin/$HEAD_BRANCH" || { echo "checkout failed"; exit 1; }

PROMPT="You are fixing an open pull request whose CI checks are failing or missing.
Repository: $OWNER/$REPO
PR number: #$NUMBER
You are already on the PR's head branch in a clean checkout.
Task: investigate why the checks are failing (or why none ran), make the minimal
correct fix, run the project's tests/build locally to confirm they pass, then
commit and 'git push' to the SAME branch to update this PR. Do NOT open a new PR,
do NOT force-push, and do NOT change unrelated code. If you cannot determine the
failure, push nothing and explain what you found."

echo "--- launching claude ---"
claude -p "$PROMPT" --dangerously-skip-permissions
echo "=== fix done $(date) — exit $? ==="
