# Quality, Testing, and Log Workflow

## Purpose
Ensure Copilot runs tests and captures logs after each major change.

## Major Change Definition
- Any change touching architecture, authentication, authorization, data model, payments, notifications, scheduling, or shared utilities.
- Any change that spans multiple files or modifies core instructions.

## Required Workflow After Each Major Change
1. Run relevant test commands.
2. Capture output in timestamped log files under `/logs/copilot/`.
3. Read and summarize test/log output before continuing.
4. If tests fail:
   - mark related TODO as `BLOCKED` or keep `IN-PROGRESS`
   - record blocker reason and next action
5. If tests pass and user requested `/cp`:
   - run commit+push flow using repository convention.

## Logging Format
- Path: `/logs/copilot/YYYYMMDD/`
- File names:
  - `test-<label>-<timestamp>.log`
  - `build-<label>-<timestamp>.log`

## Recommended Commands
- Use `scripts/dev/run-quality-gate.ps1` to execute command + capture logs.
- Use `scripts/dev/read-latest-log.ps1` to fetch recent log output.
