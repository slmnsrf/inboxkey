# Feature Flags

## Watch Sessions V2

### Overview

Watch Sessions V2 introduces an improved scoring algorithm for code matching with domain affinity, recency boost, session boost, and shape matching.

### Configuration

The feature is controlled by the `watchSessionV2Enabled` setting in the Settings schema.

**Default:** `false` (disabled for gradual rollout)

**Future Default:** `true` (after v2.0 stable release)

### Behavior

#### When Enabled (`watchSessionV2Enabled: true`)

The system uses the full V2 scoring algorithm:

- **Domain Affinity (0-100 points)**: Graduated scoring for exact, alias, and token matches
- **Recency Boost (0-250 points)**: Exponential decay favoring recent emails
- **Session Boost (0-100 points)**: Bonus for emails arriving near session start
- **Shape Match (0-8 points)**: Tiebreaker for expected code patterns
- **Used Penalty (-50 points)**: Deduct points for already-used codes

**Total possible score:** ~450 points (before used penalty)

**Minimum acceptance threshold:** 10 points

#### When Disabled (`watchSessionV2Enabled: false`)

The system falls back to simplified matching:

- **Domain Affinity**: Basic eTLD+1 matching only
- **Recency Boost**: Standard exponential decay
- **No Session Boost**: Session timing not considered
- **No Shape Match**: Code pattern not considered
- **Used Penalty**: Applied as normal

This mode uses only the core domain and recency components without the V2 enhancements.

### Usage

#### Programmatic Access

```typescript
import { StorageFactory } from '@/lib/storage/storage-factory'

// Check if v2 is enabled
const storage = await StorageFactory.create()
const settings = await storage.getSettings()
const v2Enabled = settings.watchSessionV2Enabled ?? false

// Use appropriate scoring
if (v2Enabled) {
  // Call with v2 parameters
  const best = findBestMatchingCode(
    codes,
    url,
    Date.now(),
    sessionStart,    // Enable session boost
    expectedShape    // Enable shape matching
  )
} else {
  // Call without v2 parameters
  const best = findBestMatchingCode(
    codes,
    url,
    Date.now()
  )
}
```

#### Enable via Storage API

```typescript
import { StorageFactory } from '@/lib/storage/storage-factory'

const storage = await StorageFactory.create()
await storage.updateSettings({
  watchSessionV2Enabled: true
})
```

#### Enable via Chrome DevTools Console

```javascript
// In background service worker console
const storage = await import('./src/lib/storage/storage-factory').then(m => m.StorageFactory.create())
await storage.updateSettings({ watchSessionV2Enabled: true })
console.log('Watch Sessions V2 enabled')
```

### Debug Scoring (Development Only)

The `debugScoringEnabled` setting shows scoring breakdown in the popup for debugging.

**Default:** `false`

**Note:** This setting is intended for development/debugging and should not be exposed in production UI.

```typescript
// Enable debug scoring
await storage.updateSettings({
  debugScoringEnabled: true
})
```

### Migration Path

1. **Phase 1 (Current):** V2 disabled by default, opt-in for testing
2. **Phase 2 (Beta):** V2 enabled for subset of users via A/B testing
3. **Phase 3 (Stable):** V2 enabled by default, opt-out available
4. **Phase 4 (Final):** V2 permanently enabled, flag removed

### Implementation Details

**Files Modified:**

- `/src/lib/storage/schema.ts` - Added feature flag to Settings interface
- `/src/lib/matching/code-matcher.ts` - Added documentation about flag usage
- `/src/background/session-controller.ts` - Checks flag and gates v2 parameters

**Backward Compatibility:**

- V1 implementation has been removed
- V2 is the only algorithm implementation
- Feature flag controls which parameters are passed to v2 algorithm
- When disabled, v2 algorithm runs with basic parameters (no session/shape boost)

### Testing

All existing tests continue to pass with the feature flag implementation:

```bash
# Run code matcher tests
npx vitest run tests/unit/code-matcher.test.ts

# Build extension
npm run build
```

**Test Coverage:** 49 tests covering:
- Basic domain matching
- Recency scoring
- V2 domain affinity
- Session boost
- Shape matching
- Integration scenarios

### Rollback Plan

If issues are discovered with V2:

1. Set default to `false` in `DEFAULT_SETTINGS`
2. Push update to users
3. Investigate issues
4. Fix and re-enable

The feature flag ensures zero-downtime rollback capability.
