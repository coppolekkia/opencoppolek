# Fix for Issue #28339 - Control UI Config Validation

## Problem
Disabling "Update Check on Start" in Control UI causes "invalid config" error.

## Solution
Use JSON Merge Patch (RFC 7396) to send only changed fields.

## Implementation
1. Detect changed fields by comparing form state with original config
2. Build minimal patch object
3. Use `config.patch` endpoint instead of `config.set`

## Files to Modify
- `ui/src/ui/controllers/config/form-utils.ts` (new)
- `ui/src/ui/controllers/config.ts`

## Related
- Issue #28339
- PR #28383 (alternative implementation)

<!-- CI trigger: Updated documentation -->
