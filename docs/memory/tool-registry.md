# AI Tool Registry

This file registers all AI tools that work on this project and their memory system configurations.

## Purpose

The tool registry provides:
- **Tool Identification**: Which tools work on this project and their capabilities
- **Memory System Mapping**: Where each tool stores its memory
- **Pattern Documentation**: Tool-specific working patterns and conventions
- **Integration Notes**: How tools integrate with the shared memory pool

## Registry

### Kilocode

**Status**: Active
**Registry Added**: [Date added]
**Memory System**: plans/kilocode-memory-system-design.md
**Integration Level**: Full integration with shared memory pool

**Capabilities**:
- Automated memory tracking with JSON entries
- Version logging and CHANGELOG integration
- Documentation auto-update mechanism
- Git hooks for pre-commit memory updates
- NPM scripts for memory management

**Working Patterns**:
- Uses `.memory/` directory for structured JSON memory entries
- Generates human-readable `MEMORY.md` from JSON entries
- Tracks version changes automatically during builds
- Updates documentation based on code changes

**Integration with Shared Memory**:
- Kilocode should sync completed work to `docs/memory/shared-memory.md` at session end
- Use shared memory for cross-tool continuity
- Reference shared memory entries in Kilocode's internal memory system
- Maintain tool-specific patterns in Kilocode's JSON entries

**Special Commands**:
- `npm run memory:init` - Initialize memory system
- `npm run memory:analyze` - Analyze commits and generate memory entries
- `npm run memory:update` - Update documentation from memory
- `npm run memory:query` - Query memory database
- `npm run version:bump` - Log version changes

**Notes**:
- Kilocode's memory system is the most sophisticated in this project
- Other tools should reference Kilocode patterns where appropriate
- JSON entry schema is well-documented in `plans/kilocode-memory-system-design.md`

---

### Roocode

**Status**: Pending Discovery
**Registry Added**: [Date added]
**Memory System**: (to be discovered)
**Integration Level**: (to be determined)

**Capabilities**: (to be documented)

**Working Patterns**: (to be documented)

**Integration with Shared Memory**:
- Should read from `docs/memory/shared-memory.md` on session start
- Should write to `docs/memory/shared-memory.md` during work
- Should maintain tool-specific memory if it exists
- Should sync tool-specific memory to shared memory at session end

**Discovery Tasks**:
- [ ] Search for Roocode-specific memory files
- [ ] Document Roocode's working patterns
- [ ] Understand Roocode's capabilities and limitations
- [ ] Test integration with shared memory pool

---

### Opencode

**Status**: Active
**Registry Added**: [Date added]
**Memory System**: docs/memory/shared-memory.md (shared pool)
**Integration Level**: Primary maintainer of shared memory system

**Capabilities**:
- File operations: `read`, `write`, `edit` (exact string replacements)
- Project exploration: `glob` (pattern matching), `grep` (content search)
- Web operations: `webfetch`, `websearch`, `codesearch` (for code examples)
- Shell operations: `bash` (run commands with optional timeout and workdir)
- Task management: `todowrite`, `todoread`
- Code execution: `task` (launch sub-agents for complex work)
- User interaction: `question` (ask user for input/decisions)

**Working Patterns**:
- Reads files in chunks (500 lines max) to manage token budget
- Uses `read` tool with offset/limit for large files
- Prefers `edit` over `write` for existing files (must read first)
- Uses `glob` and `grep` for code exploration
- Uses `bash` for git operations, npm scripts, testing
- Uses `task` for complex, multi-step tasks that can run in parallel
- Uses `question` to clarify ambiguous requirements

**File Reading Strategy**:
```typescript
// Read in 500-line chunks
read(filePath, offset=0, limit=500)   // First chunk
read(filePath, offset=500, limit=500)  // Second chunk
read(filePath, offset=1000, limit=500) // Third chunk
// etc.
```

**Code Editing Strategy**:
```typescript
// Must read file first
read(filePath)  // Load file content

// Then use edit for changes
edit(filePath, oldString, newString)

// Use replaceAll for renaming
edit(filePath, oldString, newString, replaceAll=true)
```

**Integration with Shared Memory**:
- Primary maintainer: Creates and updates `docs/memory/shared-memory.md`
- Reads shared memory first on session start
- Updates shared memory incrementally during work
- Syncs to `docs/MEMORY.md` as needed
- No internal memory system - relies entirely on shared memory

**Quick Start**:
- Read [`agents.min.md`](../agents.min.md) first for optimized onboarding
- Then read `docs/MEMORY.md` and `docs/memory/shared-memory.md` for detailed context

**Special Patterns**:
- **Task Management**: Uses `todowrite` for complex tasks, `todoread` to check progress
- **Parallel Tool Calls**: Batches independent file reads in single message for efficiency
- **Context Budgeting**: Reads large files strategically (500 lines max), summarizes logic
- **Decision Documentation**: Emphasizes "why" over "what" in code comments

**Limitations**:
- No persistent internal memory across sessions
- Relies on shared memory for continuity
- Cannot modify binary files
- Cannot access files outside project directory

**Notes**:
- Current tool (this registry entry was created by Opencode)
- Maintains all shared memory documentation
- Best for: File operations, code editing, project refactoring
- Less suited for: Complex reasoning without external tools (use MCP servers)

---

### Amp

**Status**: Pending Discovery
**Registry Added**: [Date added]
**Memory System**: (to be discovered)
**Integration Level**: (to be determined)

**Capabilities**: (to be documented)

**Working Patterns**: (to be documented)

**Integration with Shared Memory**:
- Should read from `docs/memory/shared-memory.md` on session start
- Should write to `docs/memory/shared-memory.md` during work
- Should maintain tool-specific memory if it exists
- Should sync tool-specific memory to shared memory at session end

**Discovery Tasks**:
- [ ] Search for Amp-specific memory files
- [ ] Document Amp's working patterns
- [ ] Understand Amp's capabilities and limitations
- [ ] Test integration with shared memory pool

---

### Gemini

**Status**: Pending Discovery
**Registry Added**: [Date added]
**Memory System**: (to be discovered)
**Integration Level**: (to be determined)

**Capabilities**: (to be documented)

**Working Patterns**: (to be documented)

**Integration with Shared Memory**:
- Should read from `docs/memory/shared-memory.md` on session start
- Should write to `docs/memory/shared-memory.md` during work
- Should maintain tool-specific memory if it exists
- Should sync tool-specific memory to shared memory at session end

**Discovery Tasks**:
- [ ] Search for Gemini-specific memory files
- [ ] Document Gemini's working patterns
- [ ] Understand Gemini's capabilities and limitations
- [ ] Test integration with shared memory pool

---

### Claude

**Status**: Pending Discovery
**Registry Added**: [Date added]
**Memory System**: (to be discovered)
**Integration Level**: (to be determined)

**Capabilities**: (to be documented)

**Working Patterns**: (to be documented)

**Integration with Shared Memory**:
- Should read from `docs/memory/shared-memory.md` on session start
- Should write to `docs/memory/shared-memory.md` during work
- Should maintain tool-specific memory if it exists
- Should sync tool-specific memory to shared memory at session end

**Discovery Tasks**:
- [ ] Search for Claude-specific memory files
- [ ] Document Claude's working patterns
- [ ] Understand Claude's capabilities and limitations
- [ ] Test integration with shared memory pool

---

### Antigravity

**Status**: Pending Discovery
**Registry Added**: [Date added]
**Memory System**: (to be discovered)
**Integration Level**: (to be determined)

**Capabilities**: (to be documented)

**Working Patterns**: (to be documented)

**Integration with Shared Memory**:
- Should read from `docs/memory/shared-memory.md` on session start
- Should write to `docs/memory/shared-memory.md` during work
- Should maintain tool-specific memory if it exists
- Should sync tool-specific memory to shared memory at session end

**Discovery Tasks**:
- [ ] Search for Antigravity-specific memory files
- [ ] Document Antigravity's working patterns
- [ ] Understand Antigravity's capabilities and limitations
- [ ] Test integration with shared memory pool

---

## Integration Guidelines

### For New Tools

When a new AI tool starts working on this project:

1. **Check Registry**: Look up your tool in this registry
2. **If Registered**: Follow documented patterns and integration notes
3. **If Not Registered**: Add yourself to the registry with:
   - Tool name and status
   - Memory system location (if any)
   - Capabilities
   - Working patterns
   - Integration level with shared memory

### Discovery Process

To discover a tool's memory system:

1. **Search for Tool-Specific Files**:
   ```bash
   # Search for tool name in filenames
   glob("*kilocode*")
   glob("*roocode*")
   glob("*opencode*")
   glob("*amp*")
   glob("*gemini*")
   glob("*claude*")
   glob("*antigravity*")
   ```

2. **Search for Documentation**:
   ```bash
   # Search for tool mentions in docs
   grep("kilocode|roocode|opencode|amp|gemini|claude|antigravity", "docs/")
   ```

3. **Search for Directories**:
   ```bash
   # Check for tool-specific directories
   ls -la .kilocode/ 2>/dev/null
   ls -la .roocode/ 2>/dev/null
   ls -la .opencode/ 2>/dev/null
   # etc.
   ```

4. **Document Findings**:
   - Add to tool registry
   - Note memory system location
   - Document working patterns
   - Update integration notes

### Cross-Tool Handoff

When handing off work from one tool to another:

1. **Update Shared Memory** (first tool):
   - Document what was completed
   - Note any incomplete work
   - Add cross-tool context for next tool
   - Update task statuses

2. **Read Shared Memory** (second tool):
   - Check recent entries from first tool
   - Understand context and incomplete work
   - Note any tool-specific patterns or issues
   - Continue from where first tool left off

3. **Maintain Continuity**:
   - Use same task references (t6, t7, etc.)
   - Reference previous tool's entries
   - Document any deviations from previous approach
   - Keep shared memory updated

### Conflict Resolution

When tools have conflicting approaches or information:

1. **Project Docs Are Authoritative**: `AGENTS.md`, `docs/MEMORY.md`, `docs/architecture.md` take precedence
2. **Shared Memory Is Reference**: Use shared memory for current work context
3. **Tool-Specific Memory Is Supplemental**: Use for tool-specific patterns only
4. **Document Conflicts**: When you find conflicts, document them in shared memory

## Version Control

This file is git-tracked and part of the project documentation.

- Commit changes with descriptive messages
- Example: `docs(memory): tool-registry - add Roocode discovery tasks`
- Reference tool registry in related commits
- Keep registry in sync with actual tool usage
