---
name: land
description: >-
  Land the requested changes in the Billing-Software repository. Invoke only
  when the user has explicitly requested landing or merging the changes; do not
  invoke for review, preparation, passing checks, or skill installation alone.
disable-model-invocation: true
metadata:
  delta-action: land
---

# Land changes in Billing-Software

Use this workflow only after the user explicitly requests landing. That request
is authorization to carry out the landing workflow; do not ask for merge
permission again. Target the repository's current default branch, expected to be
`main`, using a pull request and squash merge. Do not push directly to the
default branch or delete the topic branch.

## 1. Preflight

1. Confirm the repository root and read all applicable `AGENTS.md`,
   `AGENT.md`, contribution instructions, PR templates, and relevant policies.
   The last inspection found none. Recheck every time.
2. Inspect `git status --short`, the current branch and its upstream, recent
   commits, and configured remotes. Recheck the GitHub repository URL and
   default branch using `gh repo view` and `gh api`. Use `origin` only if it
   still points to the intended GitHub repository; never publish through the
   `local` backlink.
3. Preserve unrelated user work. Identify which tracked and untracked files
   belong to the requested change, inspect their diffs, and stage only those
   paths. Exclude `.env` files, credentials, `node_modules`, build output, and
   other generated files. Do not use a blanket `git add -A` unless you have
   established that every resulting path belongs in this change.
4. Check whether the current branch is the default branch. If so, create a
   descriptive topic branch from the current work without losing uncommitted
   changes. If already on the appropriate topic branch, keep using it. Do not
   reset, rebase, or discard unrelated work.
5. Inspect GitHub branch protection, merge settings, open PRs, and required
   checks. The last inspection found `main` unprotected, no PR history, all
   three merge strategies allowed, no CI workflow, and no commit-signing
   requirement; verify current settings rather than assuming they remain so.
   Stop if repository settings, ownership, or target branch are unclear.
6. Check for commit-message, changelog, sign-off, contributor-agreement,
   reviewer, or other submission requirements. The last inspection found no
   contribution guide, PR template, issue template, changelog requirement, or
   signing policy. Follow any requirements discovered now. Do not invent issue
   references or claim human authorship for generated text.

## 2. Resolve conflicts safely

The user's conflict preference is to resolve conflicts automatically when the
intended result is clear. Preserve unrelated work and use surrounding code,
tests, and the requested change to establish intent. If the correct resolution
is ambiguous, would discard unrelated edits, or would change product behavior
without support from the task/specification, stop and ask the user. Rerun
applicable checks after any resolution.

## 3. Verify the exact change

Run checks against the exact staged change that will be committed. The scripts
below are defined in `backend/package.json` and `client/package.json`;
`npm audit` is the documented security check in `spec.md` §12 and §19.

```sh
(cd backend && npm test)
(cd backend && npm audit --audit-level=moderate)
(cd client && npm run build)
(cd client && npm audit --audit-level=moderate)
git diff --cached --check
```

Also apply the feature definition of done in `spec.md` Appendix D and the
relevant acceptance criteria in §19 and §21. For the auth/user changes in this
repository, this includes database-backed migration/endpoint verification,
RBAC/IDOR coverage, and review by another engineer. The current progress notes
in `backend/PROGRESS.md` identify database integration and several auth tests as
pending; do not treat the existing two password-policy unit tests as completing
those requirements.

The supported migration command is `cd backend && npm run db:migrate`
(`backend/package.json`); it applies `schema_new.sql` and the auth extension
(`backend/src/scripts/migrate.js`). Run it only when `DATABASE_URL` is known to
point to a fresh, isolated test database. Never run it against production or an
unverified shared database. Do not run destructive database commands.

After publishing the PR, record its number from the URL printed by `gh pr
create`. Inspect required CI checks using
`gh pr checks "$PR_NUMBER" --required --json bucket,name,state,workflow` and
inspect its review state using
`gh pr view "$PR_NUMBER" --json reviewDecision,reviews,statusCheckRollup`.
Every configured required check must be completed and passing on the PR's
current head. A pending, failing, missing, or unverifiable required check is
not a pass. If no CI or test mechanism exists for a requirement imposed by the
spec, stop and report that blocker instead of silently waiving it. Never bypass
branch protection, required reviews, checks, or merge queues with administrator
privileges.

## 4. Commit and open the PR

1. Review the staged file list, staged diff, secret-sensitive files, and
   `git diff --cached --check`. Ensure the PR contains only the requested
   project changes.
2. Create a descriptive, non-interactive commit with an editor guard, for
   example:

   ```sh
   git -c core.editor=true commit -m "Implement subscription system changes"
   ```

   Use the actual scope in the subject. Follow any commit convention found in
   the current repository instructions.
3. Push the topic branch to the verified `origin` and open a PR targeting the
   verified default branch. Use non-interactive flags and provide a factual
   title/body summarizing the changes, tests actually completed, and remaining
   limitations. No issue-closing reference is needed unless an applicable
   issue exists.

   ```sh
   TOPIC_BRANCH="$(git branch --show-current)"
   DEFAULT_BRANCH="$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)"
   git push -u origin "$TOPIC_BRANCH"
   gh pr create --base "$DEFAULT_BRANCH" --head "$TOPIC_BRANCH" --title "$PR_TITLE" --body "$PR_BODY"
   ```

   Set `PR_TITLE` and `PR_BODY` to a concise, factual summary and the checks
   actually completed; do not claim pending or unrun checks passed.

4. Do not merge until the PR satisfies the applicable feature definition of
   done, receives the required independent review, and every required check
   passes for its current head. If it is not ready, leave it open and report
   what is missing.

## 5. Squash-merge and verify

Immediately before merging, refresh the PR and confirm its head has not changed,
the base is still the current default branch, review is approved, and all
required checks pass. Use the repository-supported squash strategy without
bypassing safeguards:

```sh
gh pr merge "$PR_NUMBER" --squash
```

Do not request automatic merging when required checks or reviews are pending.
After GitHub reports the PR merged, fetch the target branch and verify the PR's
merge commit is an ancestor of the remote default branch. If the PR is not
reported merged or the merge commit cannot be verified on the target, report
that landing is incomplete.
