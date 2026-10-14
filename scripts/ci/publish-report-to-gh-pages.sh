#!/usr/bin/env bash
# Publishes a generated Allure report into one directory of the gh-pages branch
# (main/ for the main branch, pr-<number>/ for pull requests), keeping the other reports.
#
# Usage: scripts/ci/publish-report-to-gh-pages.sh <report-directory> <target-directory>
set -euo pipefail

report_directory="$(cd "$1" && pwd)"
target_directory="$2"
pages_branch="${PAGES_BRANCH:-gh-pages}"
maximum_push_attempts=5
worktree="$(mktemp -d)"
trap 'git worktree remove --force "$worktree" >/dev/null 2>&1 || true' EXIT

git config user.name >/dev/null || git config user.name 'github-actions[bot]'
git config user.email >/dev/null || git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

if git ls-remote --exit-code --heads origin "$pages_branch" >/dev/null; then
  git fetch --depth=1 origin "$pages_branch"
  git worktree add --detach "$worktree" FETCH_HEAD
else
  echo "Branch $pages_branch does not exist yet; creating it."
  # A root commit with an empty tree: works on every git version (unlike `worktree add --orphan`).
  empty_tree="$(git hash-object -t tree /dev/null)"
  root_commit="$(git commit-tree "$empty_tree" -m "Start $pages_branch for published Allure reports")"
  git worktree add --detach "$worktree" "$root_commit"
fi

rm -rf "${worktree:?}/$target_directory"
mkdir -p "$worktree/$target_directory"
cp -R "$report_directory/." "$worktree/$target_directory/"

# Serve files as-is (no Jekyll processing) and send visitors of the site root to the main report.
touch "$worktree/.nojekyll"
cat > "$worktree/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Activity Ranking API: acceptance reports</title>
<meta http-equiv="refresh" content="0; url=main/">
<a href="main/">Open the latest report for the main branch</a>
HTML

cd "$worktree"
git add --all
if git diff --cached --quiet; then
  echo "Report unchanged; nothing to publish."
  exit 0
fi
git commit --quiet --message "Publish Allure report to $target_directory"

for attempt in $(seq 1 "$maximum_push_attempts"); do
  if git push --quiet origin "HEAD:refs/heads/$pages_branch"; then
    echo "Published $target_directory to $pages_branch."
    exit 0
  fi
  echo "Push attempt $attempt failed (another report was published meanwhile); rebasing and retrying."
  git fetch --quiet --depth=1 origin "$pages_branch"
  git rebase --quiet FETCH_HEAD
done

echo "Could not publish the report after $maximum_push_attempts attempts." >&2
exit 1
