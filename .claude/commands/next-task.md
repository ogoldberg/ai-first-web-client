# Next Task Workflow

Execute this workflow sequentially to maintain quality and avoid resource issues.

## Step 0: Fix Pre-existing Type Errors on Main (BLOCKING)

Before any other work, ensure main branch is in a healthy state:

1. Run `npm run build` on main branch (TypeScript compilation includes type checking)
2. If there are type errors, these MUST be fixed first as a blocking priority
3. Create a fix branch: `git checkout -b fix/type-errors main`
4. Fix all type errors systematically
5. Run `npm run build` to verify (add `&& npm test` once tests exist)
6. Commit, push, and create a PR for the fixes
7. This is P0 priority - do not proceed to other tasks until main builds cleanly

**Why this matters:** Type errors on main block all other work and compound over time.

## Step 1: Complete Current Work (if any uncommitted changes)

If there are uncommitted changes on the current branch:

1. Write tests for new functionality or bug fixes (regression tests)
2. Run checks: `npm run build` - fix any errors before proceeding
3. Commit all changes with a descriptive message
4. Push the branch
5. Create a pull request for the current branch
6. Update PROJECT_STATUS.md to reflect completed work

## Step 2: Process Open PRs

Run `gh pr list --state open` to get all open PRs.

For each PR, check:

1. **Merge status**: `gh pr view [NUMBER] --json mergeable,mergeStateStatus`
2. **Review comments**: Use GraphQL query below

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        headRefName
        mergeable
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 10) {
              nodes { body author { login } createdAt }
            }
          }
        }
      }
    }
  }
' -f owner=ogoldberg -f repo=ai-first-web-client -F pr=PR_NUMBER
```

### Handling PRs with Merge Conflicts

**NEVER close a PR just because it has merge conflicts.** Instead:

1. Checkout the branch and rebase onto main:

   ```bash
   git checkout [BRANCH_NAME]
   git rebase main
   ```

2. Resolve conflicts:
   - For documentation files (PROJECT_STATUS.md, etc.): Usually accept main's version
   - For code files: Carefully merge both changes, preserving new functionality
   - After resolving: `git add [file] && git rebase --continue`

3. Verify the rebased code:

   ```bash
   npm run build
   ```

4. Force push the rebased branch:
   ```bash
   git push --force-with-lease
   ```

### Handling PRs with Review Comments

Process each PR with unresolved comments one at a time:

1. Checkout the branch: `git checkout [BRANCH_NAME]`
2. Read unresolved comments (filter: isResolved=false, newer than last commit)
3. Address each comment by making the required code changes
4. Run: `npm run build`
5. Commit with message: `fix: Address PR review comments`
6. Push changes: `git push`
7. Resolve each comment thread via GitHub API or web UI

### Merging PRs

Once a PR has been reviewed (bot reviews count!) and all comments addressed:

1. Verify the PR is mergeable: `gh pr view [NUMBER] --json mergeable,mergeStateStatus`
2. If CLEAN and MERGEABLE, merge it: `gh pr merge [NUMBER] --squash --delete-branch`
3. **Human reviews are NOT required** - bot reviews (Gemini Code Assist, etc.) are sufficient

### Comment Filtering Rules

Skip comments that match ANY of:

1. Thread already resolved (`isResolved: true`)
2. We already replied with "addressed/fixed/resolved"
3. Comment is older than the latest commit on the branch

## Step 3: Start Next Task

1. Switch to main and pull: `git checkout main && git pull`
2. Read docs/BACKLOG.md and docs/PROJECT_STATUS.md to identify the next task using priority order:
   - **First:** Any task marked "In Progress" in PROJECT_STATUS.md
   - **Second:** P0 (Critical) tasks in BACKLOG.md
   - **Third:** P1 (High Priority) tasks in BACKLOG.md
   - **Fourth:** P2 (Medium Priority) tasks in BACKLOG.md
   - **Fifth:** Items in "Technical Debt & Known Issues" section of PROJECT_STATUS.md

3. **Claim the task on main FIRST** (prevents other workers from duplicating):

   ```bash
   # Update PROJECT_STATUS.md to mark task as "in progress"
   git add PROJECT_STATUS.md
   git commit -m "docs: Mark [task] as in progress"
   git push origin main
   ```

4. Create a feature branch:

   ```bash
   git checkout -b feat/[task-name] main
   ```

5. Implement the task:
   - Write the code
   - Write tests for new functionality (in `tests/` directory)
   - Run: `npm run build` - fix ALL errors
   - Commit with descriptive message
   - Push and create PR:
     ```bash
     git push -u origin feat/[task-name]
     gh pr create --title '[title]' --body '[description]'
     ```

## Step 4: Cycle Back

After completing the task:

1. Check if new PR comments appeared
2. If yes, return to Step 2 (PR processing)
3. If no, return to Step 3 (next task)
4. Continue until a stopping condition is met

## Stopping Conditions

Stop when ANY condition is met:

1. **No more tasks:** BACKLOG.md has no unclaimed P0/P1/P2 tasks
2. **Tasks blocked:** Remaining tasks require external input/dependencies
3. **Ambiguous tasks:** Next tasks are unclear, need user clarification

Note: Bot reviews are sufficient - do NOT stop just because PRs are awaiting human review.

When stopping, report:

- Number of tasks completed
- List of PRs created/merged with URLs
- Any failures encountered
- Suggested next steps

## Important Rules

- **NEVER close a PR due to merge conflicts** - rebase and fix conflicts instead
- **NEVER skip type errors** - fix them before proceeding with other work
- **Bot reviews ARE sufficient** - human reviews are NOT required to merge
- Address any specific code suggestions from bot reviews before merging
- ALWAYS write tests for new functionality and bug fixes
- ALWAYS run `npm run build` before creating PRs
- ALWAYS claim tasks on main BEFORE starting work (prevents duplicates)
- Keep branches focused on single tasks/features

## Recovering Deleted Branches

If a branch was accidentally deleted:

```bash
# Find the commit hash from reflog
git reflog | grep "branch-name-pattern"

# Recreate the branch
git checkout -b recovered-branch-name [COMMIT_HASH]
```

## Project-Specific Notes

- **Build command:** `npm run build` (runs TypeScript compiler which does type checking)
- **Test command:** `npm test` (runs Vitest test suite)
- **Dev mode:** `npm run dev` (watch mode with auto-rebuild)
- **Start server:** `npm start`
- **Task tracking:**
  - `docs/BACKLOG.md` - Detailed task backlog with priorities (P0-P3) and effort estimates
  - `docs/PROJECT_STATUS.md` - High-level project status and changelog
- **Key directories:**
  - `src/core/` - Core components (BrowserManager, ApiAnalyzer, etc.)
  - `src/tools/` - MCP tool implementations
  - `src/utils/` - Utility functions
  - `src/types/` - TypeScript type definitions
  - `tests/` - Test files (Vitest)
