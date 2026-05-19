# Architecture Decision Record (ADR): Service Layer Consolidation

## Context
The application currently has service/utility functions scattered across multiple directories:
- `/client/lib/` (Mostly Firebase and utility functions)
- `/client/src/_services/` (API layer, Socket, DM logic)
- `/client/services/` (Legacy or unused)
- `/client/utils/` (General helpers)

This fragmentation makes onboarding difficult and leads to duplicate implementations (e.g., multiple ways to fetch data).

## Decision
Going forward, all business logic, API communication, and state synchronization will be centralized in `/client/src/_services/`.

1. **API Communication:** `apiService.ts` is the single source of truth for REST calls. No component should use `fetch` or `axios` directly.
2. **Real-time:** `socketService.ts` handles all WebSocket communication.
3. **Domain Logic:** Domain-specific transformations (like `dmHelpers.ts`) live here.
4. **Third-Party Integrations:** Wrappers for Firebase, ZegoCloud, etc., belong here to decouple the UI from specific SDKs.

### What goes in `/client/lib/`?
Only pure, stateless utility functions (e.g., string formatters, date parsers, math helpers) that have ZERO knowledge of the application's business rules or backend endpoints.

### What goes in `/client/hooks/`?
React Custom Hooks that orchestrate data between `src/_services/` and the UI layer (e.g., `useDM`, `useHomeFeed`). Hooks manage React state and side-effects but do not contain core business logic algorithms.

## Consequences
- Better testability (Services can be unit tested without React).
- Clearer boundaries between UI, State, and Data layers.
- Easier migration if backend technologies change.
