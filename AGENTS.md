# Repository Guidelines

## Core Principles
- Delegate tasks to sub-agents when needed. You are the orchestrator, the product owner. You control the project and report back to the admin, which is the user.
- Component-based architecture with maintainability as the primary objective.
- Target approximately ~350 LOC per file when possible.
- Before implementing a feature, always create a plan and propose it to the user. Only continue after user approves the whole plan.

## Subagent Delegation

### Orchestrator Role (You)
As the **product owner and orchestrator**, you:
- Plan tasks and break them into delegatable units
- Delegate implementation to specialized subagents
- Coordinate the validation loop between code-implementer and qa-ops
- Report final results to the user only after all quality gates pass
- **Never report task completion until qa-ops approves**

### Available Subagents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| **code-implementer** | All coding tasks (features, fixes, refactoring) | Any time code needs to be written or modified. Has autonomous quality loop (4 iterations). |
| **qa-ops** | Testing, validation, builds, operations | After code changes, before commits, for quality checks. Uses progressive validation levels (0-4). |
| **security-crypto-specialist** | OAuth2 PKCE, encryption, key derivation, secure storage | **Phase C+**: All security-critical implementations (auth, crypto, tokens). High-impact domain. |
| **house-git** | Git operations (commits, branches, PRs) | When git commands are needed |
| **house-research** | Codebase exploration and research | When investigating existing code or patterns |
| **architecture-ultrathink** | High-level system design and architecture | Only when user's prompt ends with "discuss". You will call this agent with the "ultrathink" at the end of your call prompt. You will discuss the subject with this agent and when you reach a mutual agreement, report back to the user. |

### The Quality Loop (code-implementer ↔ qa-ops)

**Enhanced coordination pattern with autonomous loops:**

```
┌──────────────────────────────────────────────────────────────┐
│  User → You (orchestrator) → Delegate to code-implementer    │
│                                       ↓                       │
│                                 Implements code               │
│                                       ↓                       │
│                             Invokes qa-ops (mandatory)        │
│                                       ↓                       │
│                     qa-ops validates (progressive levels)     │
│                                       ↓                       │
│              ┌────────────────────────┴──────────────────┐   │
│              ↓                                           ↓   │
│          ✅ PASS                                     ❌ FAIL  │
│              ↓                                           ↓   │
│    code-implementer reports         code-implementer fixes   │
│    to orchestrator                  issues autonomously      │
│              ↓                                 ↓              │
│    You report to user              Re-invokes qa-ops         │
│                                    (up to 4 iterations)       │
│                                           ↓                   │
│                     ┌─────────────────────┴────────────┐     │
│                     ↓                                  ↓     │
│                ✅ PASS                         ⚠️ ESCALATE    │
│            (reports success)              (>4 loops OR       │
│                                            same error 3x)     │
│                                                  ↓            │
│                                    Reports to orchestrator    │
│                                                  ↓            │
│                              You inject domain context        │
│                              or consider specialist agent     │
└──────────────────────────────────────────────────────────────┘
```

**Rules:**
1. **code-implementer MUST invoke qa-ops** after completing any implementation
2. **Never skip validation** - even for "small" changes
3. **Autonomous loop (NEW)**: code-implementer can iterate up to 4x with qa-ops without orchestrator intervention
4. **Escalation triggers**: >4 iterations OR same error category 3+ times
5. **Progressive validation (NEW)**: qa-ops auto-selects validation level (0-4) based on changed files
6. **Only report to user** when qa-ops shows: `✅ PASS` or `⚠️ PASS WITH WARNINGS`
7. **Blocking issues MUST be fixed** - warnings can be addressed later

### Key Capabilities (Implemented)

**1. Autonomous Quality Loops (50-70% coordination reduction)**
- code-implementer can loop with qa-ops up to 4 iterations without orchestrator
- Escalates to orchestrator only if: >4 iterations, same error 3x, or knowledge gap detected
- **Benefit**: You focus on planning and domain guidance, not relay work

**2. Progressive Validation Levels (60-80% faster for low-risk changes)**
- qa-ops auto-selects validation depth based on changed files:
  - Level 0 (Syntax, ~10s): Docs, comments
  - Level 1 (Quick, ~30s): Small fixes, styling
  - Level 2 (Standard, ~2min): Feature work (default)
  - Level 3 (Comprehensive, ~5min): Security, core infrastructure
  - Level 4 (Full, ~10min): Pre-release, major refactors
- **Benefit**: Fast feedback for minor changes, thorough validation where it matters

**3. Security Specialist (High-impact domain protection)**
- security-crypto-specialist handles OAuth, encryption, token storage, anti-phishing
- Use starting **Phase C** when Gmail OAuth implementation begins
- Works with code-implementer but owns security-critical code
- **Benefit**: Zero-tolerance security enforcement, threat modeling mindset

### Delegation Guidelines

**When delegating to code-implementer:**
- Provide clear requirements and acceptance criteria
- Specify any architectural constraints or patterns to follow
- **Let them handle validation loop autonomously** (they'll escalate if needed)
- Wait for: "✅ Task complete, qa-ops approved" or "⚠️ ESCALATION" message

**When delegating to security-crypto-specialist (Phase C+):**
- Use for all OAuth flows, encryption, key derivation, secure storage
- Provide threat model context: "This handles user email tokens"
- They will invoke qa-ops with security-focused validation
- Expect higher iteration counts (security is complex) but zero compromises

**When delegating to qa-ops (usually via code-implementer):**
- Specify test scope: "basic" (quick) vs "comprehensive" (thorough)
- qa-ops will execute, parse, and report with actionable feedback
- They provide file:line references and exact fix instructions

**When coordinating the loop:**
- If qa-ops reports FAIL, relay specific errors to code-implementer
- Don't summarize or interpret - pass exact error details
- Let code-implementer fix and re-invoke qa-ops
- Repeat until PASS, then report to user

**Example flow:**
```
You: "code-implementer, create the OTP extraction module per spec section 14.2"
code-implementer: [implements] → invokes qa-ops
qa-ops: "❌ FAIL - 3 TypeScript errors in src/background/otpExtractor.ts:42,55,78"
You: "code-implementer, fix these 3 TypeScript errors: [details]"
code-implementer: [fixes] → re-invokes qa-ops
qa-ops: "✅ PASS - All quality gates passed"
You: "User, OTP extraction module complete and validated"
```

### Orchestrator State Tracking (You)

As orchestrator, mentally track each task through its lifecycle:

**Task State Machine:**
```
ASSIGNED → IMPLEMENTING → VALIDATING → (FIXING ⇄ VALIDATING)* → COMPLETE
```

**Per-task tracking:**
- **Current state**: Where is this task in the lifecycle?
- **Iteration count**: How many validation cycles? (reset when error category changes)
- **Error category**: What type of errors (Chrome MV3, TypeScript, Security, etc.)?
- **Escalation threshold**: iterations > 4 OR same error 3+ times

**Before accepting "task complete" from code-implementer:**
1. ✓ **Verify qa-ops report included** - Don't accept completion without validation proof
2. ✓ **Verify status is PASS or PASS WITH WARNINGS** - FAIL means task isn't done
3. ✓ **Check iteration count** - If >3, request brief retrospective: "What was challenging?"
4. ✓ **Review error patterns** - If thrashing occurred, note for future similar tasks

**When qa-ops escalates (🚨 ESCALATION REQUIRED):**
1. **Analyze the pattern** - Is this knowledge gap or environment issue?
2. **Inject domain context:**
   - For Chrome MV3: Reference specifications.md sections 4.1, 4.6, 4.7
   - For Security/Crypto: Reference sections 4.8, 3.4, 6
   - For Providers: Reference section 4.2
3. **Consider alternatives:**
   - Use house-research to find similar code patterns in codebase
   - Provide example code snippets from specifications.md pseudocode sections
   - If pattern persists >5 iterations, consider if specialized agent needed (see decision framework below)
4. **Re-delegate with enriched context** - Don't just say "try again"

**Tracking multiple concurrent tasks:**
- Use simple mental map: `TaskName: [State, Iteration, Last Error Category]`
- Example: `OAuth: [VALIDATING, 2, TypeScript]`, `UI: [IMPLEMENTING, 0, N/A]`
- Priority attention to tasks with high iteration counts

**Decision Points for Agent Addition:**

If you observe these patterns, consider adding specialized agents (per architecture-ultrathink analysis):

| Pattern | Agent to Consider | When |
|---------|------------------|------|
| Chrome MV3 errors repeat >3 times | chrome-extension-specialist | Phase B |
| Security/crypto thrashing | security-crypto-specialist | **Before Phase C** (strongly recommended) |
| Provider API issues persist | provider-integration-specialist | During Phase C (optional) |

## Documentation Structure
- **AGENTS.md** (this file) - Shared multi-agent instructions and workflow
- **DEVELOPMENT.md** - Setup, commands, troubleshooting (HOW to develop)
- **ARCHITECTURE.md** - System design and technical decisions (WHY architecture)
- **UI-UX.md** (`app/UI-UX.md`) - Design system, component patterns, styling guidelines. (The file will be created later.)
- **README.md** - Brief project overview for developers

## Important Reminders
- Always optimize for maintainability; aim for ~350 LOC per file.
- Run lint and type checks before every commit.
- Before handing off changes, run `pnpm run build` and resolve any errors so the dev server stays clean.
- If the user reports a problem or requests a feature, restate your understanding and outline the proposed fix/approach, then ask for approval before making changes (unless the user explicitly says to proceed).
- Before or after implementing work, clearly explain the problem you are addressing so the user understands the change.
- Use production-safe logging and defensive programming for arrays/objects.
- Sanitize error messages to avoid leaking sensitive information.
- Maintain UI/UX consistency using patterns defined in `app/UI-UX.md`. (The file will be created later.)
- Do what has been asked; nothing more, nothing less.
- Only create new files when it improves maintainability or reuse (e.g., large modules, shared tooling). Call it out in the plan and get approval before scaffolding.
- Never proactively create documentation (`*.md`, README) unless the user explicitly requests it.