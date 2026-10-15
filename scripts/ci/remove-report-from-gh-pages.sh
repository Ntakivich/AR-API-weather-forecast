#!/usr/bin/env bash
# Removes one report directory (e.g. pr-42/) from the gh-pages branch once it is no longer needed.
#
# Usage: scripts/ci/remove-report-from-gh-pages.sh <target-directory>
set -euo pipefail

target_directory="$1"
pages_branch="${PAGES_BRANCH:-gh-pages}"
worktree="$(mktemp -d)"
trap 'git worktree remove --force "$worktree" >/dev/null 2>&1 || true' EXIT

if ! git ls-remote --exit-code --heads origin "$pages_branch" >/dev/null; then
  echo "Branch $pages_branch does not exist; nothing to remove."
  exit 0
fi

git config user.name >/dev/null || git config user.name 'github-actions[bot]'
git config user.email >/dev/null || git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

git fetch --depth=1 origin "$pages_branch"
git worktree add --detach "$worktree" FETCH_HEAD
cd "$worktree"

if [ ! -d "$target_directory" ]; then
  echo "No report at $target_directory; nothing to remove."
  exit 0
fi
git rm -r --quiet "$target_directory"
git commit --quiet --message "Remove Allure report $target_directory"
git push --quiet origin "HEAD:refs/heads/$pages_branch"
echo "Removed $target_directory from $pages_branch."
