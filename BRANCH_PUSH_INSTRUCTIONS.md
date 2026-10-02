# Branch Creation and Push Instructions

## Summary

This document provides the commands to create a branch, commit the changes, and push to the repository for the PR addressing issues #350, #365, and #370.

## Changes Made

1. **Task 1 (#350)**: Updated Node.js version from 20 to 22 in CI workflows
   - `.github/workflows/ci.yml`
   - `.github/workflows/deploy-testnet.yml`

2. **Task 2 (#365)**: Created determinism documentation
   - `docs/determinism.md` (new file)
   - `CONTRIBUTING.md` (updated with link)
   - `python/README.md` (updated with link)

3. **Task 3 (#370)**: Core refactor (already completed in previous work)
   - `packages/core/src/index.ts` (already refactored)

## Branch Creation and Push Commands

```bash
# Navigate to the Stellar-agentic directory
cd /home/emmanuel-ogheneovo/wave9/Stellar-agentic

# Create a new branch for the changes
git checkout -b ci-docs-refactor-350-365-370

# Add all changed files
git add .github/workflows/ci.yml
git add .github/workflows/deploy-testnet.yml
git add docs/determinism.md
git add CONTRIBUTING.md
git add python/README.md
git add PR_CI_DOCS_REFACTOR.md

# Commit the changes with a descriptive message
git commit -m "fix(ci): bump Node to 22, add determinism docs, verify core refactor

- Update Node.js from 20 to 22 in CI workflows to fix deprecation warnings (#350)
- Add comprehensive determinism guarantee documentation (#365)
- Link determinism docs from CONTRIBUTING.md and python/README.md
- Core refactor already completed in previous work (#370)

Closes #350, #365, #370"

# Push the branch to the remote repository
git push -u origin ci-docs-refactor-350-365-370
```

## After Pushing

1. **Create a Pull Request** on GitHub using the branch `ci-docs-refactor-350-365-370`
2. **Use the PR description** from `PR_CI_DOCS_REFACTOR.md` as the template
3. **Link the issues** in the PR title or description (the commit message already includes the closes references)
4. **Request review** from maintainers

## Verification

Before pushing, you may want to verify the changes:

```bash
# Check the status of changes
git status

# Review the diff
git diff

# View the staged changes
git diff --staged
```

## Notes

- Task 3 (core refactor) was already completed in a previous refactoring effort, so no code changes were needed for that issue
- The PR description in `PR_CI_DOCS_REFACTOR.md` is ready to use
- All changes are non-breaking and maintain backward compatibility
