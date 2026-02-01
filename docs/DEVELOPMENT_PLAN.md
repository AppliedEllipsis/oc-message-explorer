# OC Message Explorer - Comprehensive Development Plan

**Version**: 1.0  
**Date**: 2026-02-01  
**Estimated Duration**: 85-107 hours (5-7 weeks at 15-20 hrs/week)

---

## Executive Summary

This document outlines the comprehensive development plan to transform OC Message Explorer from a functional prototype into a production-ready tool with modular architecture, 6 beautiful themes, performance optimizations, and comprehensive testing.

**Current State**: Working prototype with basic features  
**Target State**: Professional-grade personal tool with advanced features  
**Approach**: 5-phase incremental development with working deliverables at each phase

---

## Design Philosophy

### Core Principles

1. **Personal Tool Excellence**
   - Feels like an extension of your workflow, not a platform
   - Optimized for single user speed and efficiency
   - No unnecessary complexity for multi-user scenarios

2. **Performance-First**
   - Handles thousands of messages smoothly (100k+ target)
   - Fast search (<50ms), instant theme switching (<16ms)
   - Virtual scrolling for large datasets
   - 60fps smooth interactions

3. **Beautiful but Functional**
   - Great aesthetics that don't get in the way
   - Progressive disclosure - hide complexity until needed
   - Themes enhance without distracting
   - Keyboard-first navigation

4. **Simple Distribution**
   - Single executable, no complex setup
   - No external dependencies for users
   - Cross-platform (Windows, macOS, Linux)
   - Local-first data storage (privacy by default)

5. **Future-Proof Architecture**
   - Clean separation of concerns
   - Modular design allows incremental improvements
   - Plugin system foundation for extensibility
   - Can grow from personal tool to platform if needed

---

## Codebase Analysis

### Current Architecture

**Backend (Go)**:
- Single `main.go` file (~1500 lines)
- Gorilla Mux router
- WebSocket for real-time updates
- SQLite with custom Database layer (db.go)
- Sync manager for OpenCode data directory

**Frontend**:
- Single-page HTML/JS application
- ~1600 lines CSS embedded in index.html
- ~800+ lines JavaScript in app.js
- Vanilla JavaScript (no framework)
- Current theme: GitHub-style dark mode

**Current Features**:
- Folder management with colors
- Message tree/hierarchy with parent-child relationships
- Real-time sync from OpenCode data directory
- Search with fuzzy matching (client-side)
- Tag cloud filtering
- Todo list management
- Combine messages with drag-drop ordering
- AI optimization via OpenAI API
- Import/Export JSON
- Settings management

### Identified Issues

**Architecture**:
- `main.go` is monolithic (1500 lines) mixing concerns:
  - HTTP handlers
  - WebSocket logic
  - Business logic
  - Data models
  - Sync management
- No clear separation of concerns
- No middleware or request validation
- Error handling inconsistent

**Frontend**:
- Monolithic CSS and JavaScript
- All messages loaded into memory at once
- No pagination or virtual scrolling
- Full DOM re-renders on updates
- No component reusability
- No state management pattern

**Performance**:
- Client-side search only (slows with 10k+ messages)
- No lazy loading for message content
- No virtualization for large lists
- Synchronous operations blocking UI

**Quality**:
- No unit tests
- No TypeScript
- No linting configuration for Go
- Documentation limited to README

---

## Technical Decisions

### 1. Frontend Framework: Web Components (Vanilla JS)

**Decision**: Use Web Components instead of React, Vue, or Angular

**Rationale**:
- **Lightweight**: No bundle size bloat, faster loading
- **Native Support**: Built into modern browsers, no polyfills needed
- **Distribution**: Matches "single EXE" philosophy perfectly
- **Simplicity**: Easier to distribute and maintain
- **No Build Step**: Users don't need npm/node installed
- **Performance**: Zero framework overhead

**Architecture**:
```javascript
// Custom elements for major components
<message-tree></message-tree>
<folder-list></folder-list>
<search-palette></search-palette>
<theme-switcher></theme-switcher>
<command-palette></command-palette>
```

**Trade-offs**:
- More verbose than framework components
- No built-in state management (use reactive patterns)
- Manual DOM updates (but Virtual DOM not needed with proper architecture)

### 2. Database: SQLite with FTS5

**Decision**: Use SQLite with FTS5 (Full-Text Search) extension

**Rationale**:
- **Single File**: Matches distribution model (one exe + one db file)
- **Built-in Search**: FTS5 provides production-grade full-text search
- **ACID Compliance**: Reliable data integrity
- **Zero Dependencies**: No separate database server needed
- **Performance**: Fast enough for personal use (10k-100k messages)
- **Cross-Platform**: Works identically on Windows, macOS, Linux

**Schema Enhancements**:
- Add FTS5 virtual tables for message content search
- Index tags, dates, types for faceted search
- Migration system for schema updates

**Trade-offs**:
- Not suitable for multi-user concurrent access (but we don't need that)
- Limited to single machine (but that's the personal-first approach)

### 3. AI Integration: Abstract Provider Pattern

**Decision**: Create abstraction layer supporting multiple AI providers

**Rationale**:
- **Not Locked In**: Can switch providers or use multiple
- **Future-Proof**: Easy to add local models (Llama, etc.)
- **Cost Optimization**: Choose best provider per task
- **Reliability**: Fallback options if one provider fails
- **Flexibility**: Users can choose preferred provider

**Implementation**:
```go
type AIProvider interface {
    Generate(prompt string, options AIOptions) (string, error)
    StreamGenerate(prompt string, options AIOptions) (<-chan string, error)
    CountTokens(text string) (int, error)
}

type OpenAIProvider struct { ... }
type AnthropicProvider struct { ... }
```

**Initial Support**:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)

**Future Additions**:
- Local models via Ollama
- Other cloud providers (Cohere, etc.)

### 4. Plugin System: Deferred to Phase 4

**Decision**: Build plugin system in Phase 4, not from the start

**Rationale**:
- **Focus on Core**: Solid foundation more important than extensibility
- **Stable API**: Plugins need stable API, which comes from mature core
- **Non-Breaking**: Can add later without breaking existing code
- **User Needs**: Most initial users won't need plugins
- **Complexity**: Plugin systems add significant complexity

**Plugin Architecture** (for Phase 4):
- Hook-based system (before/after events)
- Plugin manifest schema (name, version, hooks, permissions)
- Sandboxed execution (Web Workers for frontend)
- Marketplace structure (local directory + future remote)

### 5. Collaboration: Separate Module (Future)

**Decision**: Defer real-time collaboration to separate module or Phase 3+

**Rationale**:
- **Complexity**: Requires WebRTC, CRDTs, operational transform
- **Use Case**: Most usage is personal (single user)
- **Resource Allocation**: Better to invest in core experience
- **Extension**: Can be added as plugin later
- **Personal-First**: Aligns with design philosophy

**Future Implementation**:
- WebRTC for P2P syncing
- CRDTs for conflict-free offline support
- Presence indicators
- Operational Transform for real-time editing

### 6. WebAssembly: Not Needed

**Decision**: Skip WebAssembly, use SQLite FTS5 for search

**Rationale**:
- **Performance**: SQLite FTS5 is fast enough for personal use
- **Simplicity**: No WASM complexity, build steps, or compatibility issues
- **Deployment**: Simpler distribution without WASM files
- **Maintenance**: Less complex codebase
- **Adequate**: Full-text search is the main performance need, and FTS5 solves it

---

## Five Development Phases

### Phase 1: Foundation & Architecture
**Duration**: 20-25 hours  
**Goal**: Solid, maintainable codebase that can support all features

#### Key Tasks

1. **Restructure Go Backend**
   - Create modular package structure:
     ```
     cmd/server/          # Entry point
     internal/
     ├── handlers/        # HTTP route handlers
     ├── services/        # Business logic
     ├── models/          # Data structures
     ├── database/        # SQLite operations
     ├── websocket/       # WebSocket management
     └── sync/           # OpenCode sync
     ```
   - Separate concerns: HTTP handlers shouldn't contain business logic
   - Move data models to `internal/models/`
   - Create service layer for business logic
   - Extract WebSocket management to `internal/websocket/`

2. **Add Proper Error Handling**
   - Custom error types for different error categories
   - Consistent error response format
   - Request validation middleware
   - Structured error logging

3. **Implement Structured Logging**
   - Use `slog` (Go standard library)
   - JSON format for production
   - Log levels (DEBUG, INFO, WARN, ERROR)
   - Request/response logging
   - Performance metrics logging

4. **Create Database Migration System**
   - Versioned migrations
   - Automatic migration on startup
   - Rollback capability
   - Migration status tracking

5. **Setup Testing Framework**
   - Go test setup with testify/assert
   - Table-driven tests
   - Mock interfaces for external dependencies
   - Test coverage tracking
   - Target: >50% coverage for Phase 1

6. **Add Development Tooling**
   - Hot reload for Go (air or fresh)
   - Linting configuration (golangci-lint)
   - Code formatting (gofmt, goimports)
   - Pre-commit hooks

#### Deliverables

- [ ] Modular Go architecture with clear package boundaries
- [ ] Test suite with >50% coverage
- [ ] Clean project structure following Go best practices
- [ ] Developer documentation (ARCHITECTURE.md)
- [ ] Migration system for database schema changes
- [ ] Structured logging throughout application
- [ ] Consistent error handling and validation

#### Success Criteria

- All existing functionality works after refactoring
- Tests pass (unit and integration)
- Code coverage >50%
- No linting errors
- Clear separation of concerns
- Documentation complete

---

### Phase 2: Theme System
**Duration**: 15-20 hours  
**Goal**: 6 beautiful, switchable themes that preserve data and state

#### Key Tasks

1. **Theme Engine Architecture**
   - Theme manifest system (config.json per theme)
   - CSS custom properties (variables) for dynamic theming
   - Theme loader/switcher component
   - Theme persistence (localStorage + backend)
   - Base theme class with override system

2. **Extract Current GitHub Theme**
   - Separate CSS into theme-specific file
   - Create base theme with common styles
   - GitHub theme extends base
   - Document theme structure

3. **Create 5 Additional Themes**
   
   **Notion Theme**:
   - Clean, minimal aesthetic
   - Lots of whitespace
   - Soft shadows and rounded corners
   - Light and dark variants
   - Typography-focused
   
   **Terminal Theme**:
   - Monospace fonts throughout
   - Retro color palette (green phosphor, amber, etc.)
   - Command-line feel
   - ASCII/Unicode decorations
   - Dark only
   
   **Bento Theme**:
   - Card-based layout
   - Colorful accent colors
   - Japanese minimalism influence
   - Grid-based organization
   - Both light and dark variants
   
   **Paper Theme**:
   - Light theme primary
   - Typography-focused (serif fonts for content)
   - Reading-optimized
   - Print-friendly styling
   - Subtle textures
   
   **Cyberpunk Theme**:
   - Neon colors on dark backgrounds
   - Futuristic aesthetic
   - High contrast
   - Glow effects
   - Dark only

4. **Theme Components**
   - Theme-adaptable buttons, inputs, cards
   - Consistent spacing and typography per theme
   - Accessibility considerations (contrast ratios)
   - Animation/transition preferences per theme

5. **Theme Switcher UI**
   - Dropdown or grid selector
   - Theme preview/thumbnails
   - Quick switch keyboard shortcut
   - Apply without reload (instant switch)

#### Deliverables

- [ ] Theme engine with manifest system
- [ ] 6 complete themes (GitHub, Notion, Terminal, Bento, Paper, Cyberpunk)
- [ ] Theme switcher UI component
- [ ] Theme persistence across sessions
- [ ] THEMES.md documentation for theme development
- [ ] CSS custom properties architecture

#### Success Criteria

- All 6 themes render correctly
- Theme switching is instant (<16ms)
- User's theme choice persists
- No data loss when switching themes
- Accessibility: WCAG 2.1 AA contrast ratios met
- Documentation enables third-party theme creation

---

### Phase 3: Performance & UX
**Duration**: 18-22 hours  
**Goal**: Fast, responsive, delightful user experience

#### Key Tasks

1. **Virtual Scrolling**
   - Implement for message tree (target: 100k+ messages)
   - Height estimation for variable-height items
   - Dynamic sizing for different content lengths
   - Buffer zones for smooth scrolling
   - Scroll position preservation

2. **Lazy Loading**
   - Load message content on demand
   - Intersection Observer API for viewport detection
   - Progressive loading with skeleton placeholders
   - Unload content far from viewport (memory management)
   - Prioritize visible + near-visible content

3. **Command Palette**
   - Keyboard shortcut (Cmd/Ctrl+K)
   - Fuzzy search across all actions
   - Recent actions tracking
   - Frequent actions prioritization
   - Context-aware suggestions
   - Actions: search, create folder, create message, switch theme, settings, etc.

4. **Service Worker**
   - Offline support
   - Background sync when connection restored
   - Cache management strategies
   - Push notifications (future)
   - App-like experience

5. **Optimistic UI Updates**
   - Immediate feedback on user actions
   - Visual indicators for pending operations
   - Rollback on error with undo option
   - Sync conflict resolution

6. **Accessibility**
   - ARIA labels and roles throughout
   - Keyboard navigation tree (arrow keys, Enter, Space)
   - Screen reader optimization
   - Focus management and visible focus indicators
   - Reduced motion support (respect prefers-reduced-motion)
   - High contrast mode support
   - WCAG 2.1 AA compliance

#### Performance Budget

- **First paint**: < 100ms
- **Search results**: < 50ms
- **Theme switch**: < 16ms (one frame)
- **Scrolling**: 60fps consistently
- **Memory**: < 200MB for 100k messages
- **Bundle size**: < 500KB total (excluding themes)

#### Deliverables

- [ ] Virtual scrolling for message tree
- [ ] Lazy loading for message content
- [ ] Command palette component
- [ ] Service worker for offline support
- [ ] Optimistic UI updates
- [ ] Full accessibility implementation (WCAG 2.1 AA)
- [ ] Performance profiling and optimization
- [ ] SHORTCUTS.md documentation

#### Success Criteria

- Smooth 60fps scrolling with 100k messages
- Search results appear instantly (<50ms)
- App works offline (read-only mode)
- All functionality accessible via keyboard
- Screen reader can navigate and announce all content
- Lighthouse performance score >90

---

### Phase 4: Advanced Features
**Duration**: 20-25 hours  
**Goal**: Intelligence and workflow optimization

#### Key Tasks

1. **SQLite FTS5 Integration**
   - Full-text search with ranking algorithms
   - Faceted search (filter by tag, date, type, folder)
   - Search query parser (support operators like AND, OR, NOT)
   - Search suggestions/autocomplete
   - Saved searches functionality
   - Search history

2. **Undo/Redo System**
   - Action history with inverse operations
   - Visual undo stack (show last N actions)
   - Batch undo for multi-step operations
   - Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
   - Undo for: delete, move, edit, combine, etc.

3. **AI Workflow Optimization**
   - **Prompt Templates**: Predefined prompts for common tasks
   - **Multiple Providers**: OpenAI + Anthropic support
   - **Streaming Responses**: Show AI output as it generates
   - **Context Window Management**: Automatic context trimming
   - **Token Counting**: Display token usage and cost estimates
   - **Rate Limiting**: Respect API rate limits
   - **Error Handling**: Graceful handling of API failures

4. **Message Reconstruction**
   - LLM-assisted prompt combining
   - Intelligent ordering suggestions
   - Duplicate detection and removal suggestions
   - Context preservation analysis
   - Preview before apply
   - Confidence scoring

5. **Context-Aware Model Selection**
   - Auto-select model based on content type
   - Model recommendations ("This looks like code, use GPT-4")
   - Token count estimation
   - Cost vs. quality recommendations
   - User preference learning (future)

6. **Plugin System Foundation**
   - Hook-based architecture (before/after events)
   - Plugin manifest schema
   - Sandboxed execution (Web Workers)
   - Plugin lifecycle management (install, enable, disable, uninstall)
   - API for plugins to interact with core
   - Plugin marketplace structure (local directory)

#### Deliverables

- [ ] SQLite FTS5 full-text search with filters
- [ ] Undo/redo system with action history
- [ ] Enhanced AI integration (multi-provider, streaming)
- [ ] Message reconstruction AI feature
- [ ] Context-aware model selection
- [ ] Plugin system foundation
- [ ] API.md documentation

#### Success Criteria

- Search finds relevant results quickly with ranking
- Undo/redo works for all destructive operations
- AI integration supports multiple providers seamlessly
- Streaming responses display smoothly
- Plugin system allows basic extensions
- All features have comprehensive error handling

---

### Phase 5: Testing & Documentation
**Duration**: 12-15 hours  
**Goal**: Production-ready with comprehensive docs

#### Key Tasks

1. **Testing Completion**
   - **Backend Unit Tests**: 70%+ coverage
     - Handler tests with mocked services
     - Service layer tests
     - Database operation tests
     - WebSocket tests
   - **Frontend Component Tests**: Web Component testing
     - Unit tests for component logic
     - Integration tests for component interactions
   - **Integration Tests**: API endpoint testing
     - End-to-end HTTP request/response
     - Database integration
     - WebSocket integration
   - **E2E Tests**: Playwright or Cypress
     - Critical user flows
     - Cross-browser testing
     - Mobile responsiveness testing

2. **Documentation**
   - **THEMES.md**: Theme development guide
     - How to create a new theme
     - CSS custom properties reference
     - Theme manifest schema
     - Best practices
   - **API.md**: Backend API reference
     - All endpoints documented
     - Request/response examples
     - Authentication (if added)
     - Error codes
   - **SHORTCUTS.md**: Keyboard shortcuts reference
     - All keyboard shortcuts listed
     - Cheat sheet format
     - Customizable shortcuts (future)
   - **ARCHITECTURE.md**: System design
     - High-level architecture diagram
     - Data flow descriptions
     - Technology choices explained
     - Extension points
   - **CONTRIBUTING.md**: Developer guide
     - Setup instructions
     - Development workflow
     - Code style guidelines
     - Testing requirements
     - Pull request process

3. **Quality Assurance**
   - Cross-browser testing (Chrome, Firefox, Safari, Edge)
   - Mobile responsiveness verification
   - Performance profiling and optimization
   - Security audit
   - Accessibility audit

4. **Release Preparation**
   - Build automation scripts
   - Version tagging strategy
   - Release notes template
   - Distribution packages
   - Update mechanism (future)

#### Deliverables

- [ ] Comprehensive test suite (70%+ coverage)
- [ ] E2E tests for critical flows
- [ ] THEMES.md documentation
- [ ] API.md documentation
- [ ] SHORTCUTS.md documentation
- [ ] ARCHITECTURE.md documentation
- [ ] CONTRIBUTING.md documentation
- [ ] Production-ready release
- [ ] CI/CD pipeline

#### Success Criteria

- All tests pass consistently
- Code coverage >70%
- Documentation complete and accurate
- No critical bugs
- Performance targets met
- Security audit passed
- Accessibility audit passed (WCAG 2.1 AA)

---

## Implementation Strategy

### Migration Approach

**Phase 1 Migration Strategy**:
1. Create new package structure alongside existing code (don't delete yet)
2. Write comprehensive tests for existing functionality first
3. Move functions incrementally, maintaining all tests
4. Keep main.go as thin wrapper during transition
5. Gradually migrate routes to handler package
6. Remove old code once fully migrated and tested

**Key Principle**: Never break existing functionality during migration

### Testing Strategy

- **Test-First**: Write tests before or alongside code, never after
- **Incremental**: Add tests as we build, not all at end
- **Critical Path**: Focus tests on critical user flows
- **Mocking**: Mock external dependencies (AI APIs, file system)
- **Coverage**: Aim for 70%+ but prioritize critical paths over coverage numbers

### Documentation Strategy

- **Living Documentation**: Update as we build, not at end
- **Decision Logic**: Document WHY, not just WHAT
- **Code Comments**: Explain non-obvious decisions
- **External Docs**: High-level architecture, API reference, guides

---

## Timeline & Milestones

### Week-by-Week Breakdown

**Week 1: Phase 1 - Foundation**
- Days 1-2: Create new package structure
- Days 3-4: Migrate handlers and services
- Days 5-7: Add tests and validation
- **Milestone**: Modular architecture complete, all tests passing

**Week 2-3: Phase 2 - Themes**
- Week 2: Extract GitHub theme, create theme engine
- Week 3: Build 5 additional themes
- **Milestone**: 6 themes working, theme switcher functional

**Week 4: Phase 3 - Performance**
- Days 1-2: Virtual scrolling implementation
- Days 3-4: Lazy loading and command palette
- Days 5-7: Service worker and accessibility
- **Milestone**: 100k messages scroll smoothly, offline support

**Week 5-6: Phase 4 - Advanced Features**
- Week 5: FTS5 search and undo/redo
- Week 6: AI enhancements and plugin foundation
- **Milestone**: Full-text search, multi-provider AI, plugin system

**Week 7: Phase 5 - Polish & Release**
- Days 1-3: Testing completion
- Days 4-5: Documentation
- Days 6-7: QA and release
- **Milestone**: Production-ready release with complete docs

### Total Duration

- **Optimistic**: 85 hours (5 weeks at 17 hrs/week)
- **Realistic**: 100 hours (6 weeks at 17 hrs/week)
- **Conservative**: 107 hours (7 weeks at 15 hrs/week)

---

## Risk Assessment

### High Risks

1. **Scope Creep**
   - **Risk**: Adding features not in plan
   - **Mitigation**: Strict phase gates, prioritize ruthlessly, cut scope if needed
   - **Contingency**: Phase 4 can be reduced if behind schedule

2. **Refactoring Breaking Changes**
   - **Risk**: Phase 1 refactoring breaks existing functionality
   - **Mitigation**: Comprehensive tests before refactoring, incremental migration
   - **Contingency**: Keep old code as fallback during transition

### Medium Risks

3. **Virtual Scrolling Complexity**
   - **Risk**: Virtual scrolling harder than expected
   - **Mitigation**: Use proven libraries/patterns, extensive testing
   - **Contingency**: Can use pagination as fallback

4. **AI Integration Complexity**
   - **Risk**: Multiple AI providers harder to abstract than expected
   - **Mitigation**: Start with one provider, add abstraction later
   - **Contingency**: Hardcode OpenAI initially

### Low Risks

5. **Theme System Issues**
   - **Risk**: CSS architecture doesn't support theming well
   - **Mitigation**: CSS custom properties are well-established
   - **Contingency**: Can use simpler theme approach

---

## Success Metrics

### Technical Metrics

- **Performance**: <100ms first paint, <50ms search, 60fps scrolling
- **Code Coverage**: >70% test coverage
- **Bundle Size**: <500KB (excluding themes)
- **Memory Usage**: <200MB for 100k messages
- **Accessibility**: WCAG 2.1 AA compliance

### User Experience Metrics

- **Themes**: 6 themes available, instant switching
- **Search**: Full-text search with ranking and filters
- **Offline**: App works without internet (read-only)
- **Keyboard**: All functionality accessible via keyboard
- **Mobile**: Responsive design works on tablets

### Development Metrics

- **Architecture**: Clean separation of concerns
- **Documentation**: Complete API, architecture, and usage docs
- **Testing**: Comprehensive test suite, CI/CD pipeline
- **Maintainability**: Modular design, clear code organization

---

## Pre-Flight Checklist

Before beginning Phase 1, confirm:

- [ ] **Timeline**: 5-7 weeks at 15-20 hrs/week works for you?
- [ ] **Priority**: If we need to cut scope, which phase is most important?
  - Phase 1 (Foundation) - Required
  - Phase 2 (Themes) - Core feature
  - Phase 3 (Performance) - UX critical
  - Phase 4 (Advanced) - Differentiator
  - Phase 5 (Quality) - Required for production
- [ ] **Theme Style**: Any specific aesthetic preferences for themes?
- [ ] **AI Providers**: Start with OpenAI only or add Anthropic too?
- [ ] **Mobile Support**: Is responsive/mobile important or desktop-focused?
- [ ] **Data Migration**: Need to migrate existing data or clean start OK?

---

## Next Steps

1. **Await Confirmation**: User reviews and confirms pre-flight checklist
2. **Begin Phase 1**: Start with "Begin Phase 1" command
3. **Incremental Delivery**: Working increments at each phase end
4. **Regular Checkpoints**: Review progress and adjust as needed

---

## Document Information

- **Author**: AI Agent
- **Created**: 2026-02-01
- **Version**: 1.0
- **Status**: Complete, awaiting execution
- **Related Documents**:
  - [MEMORY.md](./MEMORY.md) - Query history and current focus
  - [ARCHITECTURE.md](./ARCHITECTURE.md) - System design (to be created)
  - [THEMES.md](./THEMES.md) - Theme development guide (to be created)
  - [API.md](./API.md) - API reference (to be created)
  - [SHORTCUTS.md](./SHORTCUTS.md) - Keyboard shortcuts (to be created)

---

*This plan is a living document. Update as decisions are made and lessons learned during implementation.*
