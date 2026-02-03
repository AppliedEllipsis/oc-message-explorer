# AI Agent Development Guide

This guide provides comprehensive instructions for AI agents working on projects with this scaffolding. It covers memory systems, development practices, documentation standards, and coding conventions.

## Table of Contents

- [Memory System Workflow](#memory-system-workflow)
  - [Overview](#overview)
  - [When to Update MEMORY.md](#when-to-update-memorymd)
  - [Query Documentation Guidelines](#query-documentation-guidelines)
- [Incremental Development Approach](#incremental-development-approach)
- [Documentation Practices](#documentation-practices)
- [Coding Practices](#coding-practices)
- [Memory and Decision Logic](#memory-and-decision-logic)
- [Project-Specific Guidelines](#project-specific-guidelines)

---

## Memory System Workflow

### Overview

The project includes a **Query Memory & Task Tracking** system to maintain context across AI agent sessions. This system helps track work progress, remember important decisions, and provide continuity between different AI tools.

**Key File**: [`docs/MEMORY.md`](docs/MEMORY.md) - Query history and task tracking

**Purpose**:
- Maintain context across multiple AI agent sessions
- Track progress on ongoing tasks and sub-tasks
- Document query history (sanitized of sensitive information)
- Provide quick reference for commonly used information
- Enable smooth handoffs between different AI sessions

### MEMORY.md Structure

The [`docs/MEMORY.md`](docs/MEMORY.md) file is organized into four main sections:

#### 1. Query History
Chronological list of all queries made to the agent, with:
- Timestamp in ISO 8601 UTC format
- Short descriptive title for each query
- Full query text (sanitized - no sensitive info)
- Context at the time of the query
- Outcome or status

**Important**: Always sanitize sensitive information before documenting:
- API keys → `[API_KEY]`
- Personal emails → `[USER_EMAIL]`
- Credentials → `[CREDENTIAL]`
- URLs with sensitive data → `[SENSITIVE_URL]`
- File paths with personal info → `[PERSONAL_PATH]`

#### 2. Current Focus
Details about the most recent or ongoing work:
- Last query title and timestamp
- Summary of what was being worked on
- Context needed to continue
- Planning or considerations
- Remaining items as a checklist

#### 3. Sub-tasks Tracking
Table format tracking active sub-tasks:
| # | Sub-task | Status | Notes |
|---|----------|--------|-------|
| 1 | Description | [Pending/In Progress/Complete] | Additional info |

#### 4. Quick Reference
Commonly referenced information:
- **Critical Files**: Key files with their purposes
- **Common Commands**: Frequently used commands
- **Configuration Storage**: Where sensitive data is stored
- **Memory System Usage**: Guidelines for using the memory system

### When to Update MEMORY.md

Update [`docs/MEMORY.md`](docs/MEMORY.md) in the following scenarios:

1. **Beginning a New Query Session**
   - Read the Current Focus section to understand what was previously being worked on
   - Review Sub-tasks Tracking to see if any tasks are in progress
   - Check if the new query relates to previous work

2. **During Query Processing**
   - Add the new query to Query History (sanitized)
   - Update Current Focus with the current work summary
   - Add sub-tasks to Sub-tasks Tracking as they are identified

3. **Completing Sub-tasks**
   - Update status in Sub-tasks Tracking table
   - Add relevant notes about the completion
   - Update Current Focus if the context has changed

4. **Finishing a Query**
   - Update Outcome in Query History
   - Clear or update Current Focus section
   - Mark completed sub-tasks as "Complete"
   - Update Quick Reference if new information was learned

5. **Learning New Information**
   - Add to Quick Reference section if it's commonly referenced
   - Update relevant sections with new insights

### Query Documentation Guidelines

When documenting queries in [`docs/MEMORY.md`](docs/MEMORY.md):

#### Sanitization Rules
**ALWAYS** replace sensitive information with placeholders:
```markdown
# Bad - Contains actual sensitive data
**Query**: "My API key is syn_abc123xyz789 and I'm having trouble"

# Good - Sanitized
**Query**: "My API key is [API_KEY] and I'm having trouble"
```

#### Query Entry Format
```markdown
### [YYYY-MM-DD HH:MM UTC] - Query: Short descriptive title
**Query**: Sanitized query text
**Context**: Any relevant context at the time (environment, previous state, etc.)
**Outcome**: Result or status (e.g., "Completed", "In Progress", "Blocked")
```

#### Current Focus Format
```markdown
### Last Query: [Same title as above]
**Time**: [timestamp]
**Summary**: Brief but detailed summary of what was being worked on
**Context**: What was needed to continue (files to read, commands to run, etc.)
**Planning**: What was planned or being considered (implementation approach, alternatives)
**Remaining Items**: Checklist of incomplete items or next steps
- [ ] Item 1
- [ ] Item 2
```

#### Sub-task Status Values
Use one of these status values:
- **Pending**: Not started yet
- **In Progress**: Currently being worked on
- **Complete**: Finished successfully
- **Blocked**: Waiting on something (e.g., user input, external dependency)

#### Quick Reference Guidelines
Add items to Quick Reference when:
- You find yourself looking up the same information repeatedly
- New files are created that are frequently referenced
- New commands are used often
- Configuration or architecture patterns emerge

---

## Incremental Development Approach

### Making Incremental Changes

When working on this project, follow this incremental development workflow:

#### Step 1: Understand the Current State

Before making changes:

1. **Read relevant files**: Understand the existing implementation
2. **Review documentation**: Check [`docs/`](docs/) for architecture and design decisions
3. **Identify impact**: Determine which components will be affected

#### Step 2: Make Small, Focused Changes

Follow these principles:

- **One change at a time**: Make the smallest possible change that achieves your goal
- **Atomic commits**: Each change should be independently testable and reviewable
- **Clear scope**: Focus on a single feature, bug fix, or improvement

#### Step 3: Verify Compilation

After each change:

```bash
npm run compile
```

Ensure TypeScript compilation succeeds without errors. This catches:
- Type errors
- Import issues
- Syntax errors
- Missing dependencies

#### Step 4: Run Linter

Check code quality:

```bash
npm run lint
```

Fix any linting issues before proceeding. This ensures:
- Consistent code style
- Adherence to best practices
- No obvious bugs or anti-patterns

#### Step 5: Test Your Changes

Run the test suite:

```bash
npm run test
```

If tests fail:
1. Identify the failing test
2. Understand why it failed
3. Fix the issue or update the test if the behavior change is intentional

---

## Documentation Practices

### When to Update Documentation

Update documentation **every time** you make changes that affect:

- User-facing features
- API interfaces
- Configuration options
- Architecture or design decisions
- Installation or setup procedures
- Troubleshooting information

### Documentation Standards

#### Clear and Professional

- **Use active voice**: "Click the button" not "The button should be clicked"
- **Be concise**: Get to the point without unnecessary fluff
- **Use examples**: Show, don't just tell
- **Be consistent**: Use the same terminology throughout

#### Relevant and Up-to-Date

- **Remove outdated information**: Delete old procedures that no longer apply
- **Update examples**: Ensure code examples work with current version
- **Cross-reference**: Link to related documentation
- **Version-specific**: Note when features require specific versions

#### Structure and Formatting

- **Use headers**: Organize with `##` and `###` headers
- **Use code blocks**: Format code with backticks
- **Use lists**: Use bullet points for multiple items
- **Use tables**: For configuration options or parameters

---

## Coding Practices

### TypeScript Best Practices

This project follows strict TypeScript configuration. Key practices:

#### Type Safety

**Always use explicit types**:
```typescript
// Good
const interval: number = config.refreshInterval;

// Bad - relies on inference
const interval = config.refreshInterval;
```

**Use interfaces for data structures**:
```typescript
interface UserInfo {
  id: string;
  name: string;
  email: string;
}
```

**Use enums for fixed sets**:
```typescript
enum DisplayState {
  Loading = "loading",
  Idle = "idle",
  Success = "success",
  Error = "error",
}
```

#### Null and Undefined Handling

**Use strict null checks**:
```typescript
// Good - explicit null check
if (this.config !== undefined) {
  // use config
}

// Good - optional chaining
const message = error instanceof Error ? error.message : "Unknown error";

// Bad - loose equality
if (this.config) {
  // might fail for empty string or 0
}
```

#### Error Handling

**Use custom error types**:
```typescript
export class AppError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

### Comment Standards

This project emphasizes **decision-logic comments** over descriptive comments. The goal is to explain **why** code is written a certain way, not **what** the code does.

#### What to Comment

**DO comment:**

1. **Design decisions and rationale**:
```typescript
/**
 * Design decision: We catch errors at this level to prevent system failures from
 * bubbling up. The system should remain functional even if initial operations fail,
 * allowing users to retry manually.
 */
async initialize(): Promise<void> {
  try {
    await this.setup();
  } catch (error) {
    console.error("Failed to initialize:", error);
    this.handleError(error);
  }
}
```

2. **Non-obvious implementation choices**:
```typescript
// Track initialization state to prevent race conditions during early lifecycle events
private isInitialized: boolean = false;
```

3. **Trade-offs and alternatives considered**:
```typescript
/**
 * Design rationale:
 * - maxRetries: 3 attempts balance reliability with responsiveness
 * - initialDelay: 1000ms gives transient failures time to recover
 * - maxDelay: 10000ms prevents excessively long wait times
 * - backoffFactor: 2 follows standard exponential backoff to reduce load
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
};
```

4. **Cross-file dependencies or contracts**:
```typescript
/**
 * Watch for changes in shared state (for multi-window updates)
 * Uses polling to detect changes from other windows
 */
watchSharedStateChanges(pollInterval: number = 5000): Disposable
```

5. **Performance considerations**:
```typescript
// Cache to prevent unnecessary redraws
// Design rationale: UI updates can cause visual flickering
// if done too frequently. Caching the last rendered values allows us to skip
// redundant updates when data hasn't changed, improving UX and performance.
private lastText: string | null = null;
```

**DON'T comment:**

1. **Obvious code**:
```typescript
// Bad - the code is self-explanatory
const sum = a + b;  // Add a and b together

// Good - no comment needed
const sum = a + b;
```

2. **What the code does (not why)**:
```typescript
// Bad - describes what, not why
if (usage.percentageUsed >= config.threshold) {
  this.displayState = DisplayState.Critical;  // Set display state to critical
}

// Good - explains the design decision
// Critical takes precedence over warning, which takes precedence over success
if (usage.percentageUsed >= config.threshold) {
  this.displayState = DisplayState.Critical;
}
```

#### Comment Format

**Use JSDoc for public APIs**:
```typescript
/**
 * Fetch information from API
 * @returns Information including relevant data
 */
async fetchData(): Promise<Info>
```

**Use inline comments for decision logic**:
```typescript
// Don't retry on authentication errors - they won't succeed
if (lastError instanceof AppError && lastError.type === ErrorType.Authentication) {
  throw lastError;
}
```

**Use block comments for complex rationale**:
```typescript
/**
 * Design decision: Early return when no configuration is present to avoid unnecessary operations.
 * Users expect the system to be silent until configured.
 */
private async initialize(): Promise<void> {
  const hasConfig = await this.configManager.hasConfig();
  if (!hasConfig) {
    this.statusIndicator.setIdle();
    return;
  }
  // ... rest of initialization
}
```

---

## Memory and State Optimizations

This project implements specific patterns to ensure the application remains responsive, handles high-concurrency async operations safely, and manages state efficiently.

### UI & Async Resilience

#### 1. State Cleanup on Abort
When using `AbortController` or cancellation logic (like checking for query changes), you **MUST** ensure that UI loading states (skeletons, spinners, `.loading` classes) are cleared in the terminal `finally` or `catch` blocks.
- **Why**: Prevents "infinite loading" UI when requests are cancelled by user input or navigation.
- **Pattern**:
```javascript
loadNodeContent(nodeId).then(data => {
    // update UI
}).catch(err => {
    if (err.name === 'AbortError') return cleanupLoading(nodeId);
    handleError(err);
}).finally(() => {
    removeLoadingState(nodeId);
});
```

#### 2. Request Deduplication
Never spawn multiple identical requests for the same resource simultaneously. Use a tracking `Map` to return existing promises.
- **Why**: Reduces server load and prevents race conditions where late responses overwrite early ones.
- **Pattern**:
```javascript
const pendingNodeLoads = new Map();
function loadNode(id) {
    if (pendingNodeLoads.has(id)) return pendingNodeLoads.get(id);
    const p = fetch(...).finally(() => pendingNodeLoads.delete(id));
    pendingNodeLoads.set(id, p);
    return p;
}
```

#### 3. Defensive Storage
Wrap all `localStorage` and `sessionStorage` access in `try-catch` blocks.
- **Why**: Prevents app crashes in Private Browsing modes or restricted environments where storage access throws exceptions.

#### 4. Immutable State Merging
When updating a large state object from a partial API response, always merge instead of overwriting.
- **Why**: Preserves properties (like UI state, flags, or local-only data) that aren't provided by the API.
- **Pattern**: `allMessages[id] = { ...allMessages[id], ...updatedNode };`

### Logic & Performance

#### 1. Proactive Data Validation
Validate data types and existence (especially IDs) **before** generating DOM elements or triggering background logic.
- **Why**: Prevent "undefined" or "null" strings from appearing in the DOM or being sent as API parameters (e.g., `/api/messages/undefined`).

#### 2. Backoff Delay Caps
In `fetchWithRetry` implementations, always cap the exponential backoff at a reasonable maximum (e.g., 30,000ms).
- **Why**: Prevents requests from waiting for minutes to retry, which appears to the user as a frozen application.

#### 3. High-Frequency Event Delegation
Prefer document-level event delegation for elements created dynamically (skeletons, list items).
- **Why**: Reduces memory overhead of attaching thousands of listeners and avoids listener lifecycle bugs during re-renders.

### Documenting Architectural Decisions

Architectural decisions should be documented with clear rationale explaining:

1. **The problem being solved**
2. **The chosen solution**
3. **Alternatives considered and rejected**
4. **Trade-offs made**

### What to Comment

**Comment:**

1. **Design decisions and rationale**
2. **Non-obvious implementation choices**
3. **Trade-offs and alternatives considered**
4. **Cross-file dependencies or contracts**
5. **Performance considerations**
6. **Security considerations**
7. **Migration paths or backward compatibility**

**Don't comment:**

1. **Obvious code**
2. **What the code does (not why)**
3. **Redundant type information**
4. **Outdated comments**
5. **Workarounds that should be fixed**

---

## Project-Specific Guidelines

This section should be customized for each project that uses this scaffolding. Add:

- Project-specific architecture decisions
- API endpoints and their usage
- Configuration options and their purposes
- Testing strategies specific to the project
- Deployment considerations
- Any other project-specific guidelines

### Quick Start Workflow

When starting a new session:

1. **Read agents.min.md first** - Optimized quick-start guide
2. **Read docs/memory/shared-memory.md** - Cross-tool context and pending tasks
3. **Read docs/MEMORY.md** - Query history and current focus
4. **Read relevant project documentation** - APIs, architecture, etc.
5. **Report context to user** - Summarize what you know, list pending tasks

### Commit Message Format

Follow the enhanced conventional commit format defined in [`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md):

```
~ [ short up to 8 word summary ]:

<emoji> <type>(<scope>): <subject>

<body>
```

### Testing

- Run `npm run test` to execute tests
- Run `npm run pretest` to compile and lint before testing
- Test all new features and bug fixes
- Ensure all tests pass before committing

---

## See Also

- [`agents.min.md`](agents.min.md) - Optimized quick-start guide
- [`docs/memory/shared-memory.md`](docs/memory/shared-memory.md) - Main shared memory pool
- [`docs/memory/tool-registry.md`](docs/memory/tool-registry.md) - AI tool registry
- [`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md) - Git commit message format
- [`docs/memory/README.md`](docs/memory/README.md) - Shared memory system documentation
