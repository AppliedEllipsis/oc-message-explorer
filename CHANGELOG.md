# Recent Changes

## [2026-01-31 04:15 UTC] - Fix resource exhaustion and JavaScript errors

### Backend Changes (main.go)
- No changes

### Frontend Changes (app.js & index.html)
- Fixed `loadTodos is not defined` error by moving functions to top-level scope
- Removed unnecessary content loading on expand to avoid ERR_INSUFFICIENT_RESOURCES
- `expandAll()` now only sets expanded flag without loading content
- `loadNodeAndChildren()` simplified to only load single node content
- `openEditor()` loads content on-demand when clicking on nodes
- Expand icon now simply toggles visibility without loading content
- Moved loadAgentsContent(), copyAgentsContent() to top-level scope

### Configuration Changes
- No changes to configuration structures

### Usage
- Click on node to load content and open editor
- Use ▶ to expand/collapse threads (doesn't load content anymore)
- Content loading happens automatically when clicking on a node
- No more hundreds of concurrent API requests causing resource errors

## [2026-01-31 04:00 UTC] - Fix Loading Performance and Improve Windows Shutdown

### Backend Changes (main.go)
- Removed part file loading from `loadOpenCodeMetadata()` initialization - was causing spinning hang
- Added verbose logging at each step: shows data paths, sessions processing, messages per session
- Replaced `os/signal` with `bufio.NewReader(os.Stdin)` for better Windows shutdown support
- Messages now load on-demand via `loadMessageContent()` API endpoint
- Added parent-child relationship building after all messages are loaded

### Frontend Changes (app.js & index.html)
- `loadNodeAndChildren()` recursively loads content for nodes and all descendants
- Expand icon handler loads entire thread before rendering
- Content click handler loads content before opening editor
- Search checks both raw content and AI summaries by default

### Configuration Changes
- No changes to configuration structures

### Usage
- **Stop server**: Type "exit", "quit", or "q" in console terminal (Ctrl+C not working on Windows)
- **Load content**: Click on node or expand thread (▶) to load actual message content
- **Search mode**: Toggle "Raw only" to search only actual messages
- **Display mode**: Toggle "Show raw" to display raw messages instead of summaries

## [2026-01-31 03:45 UTC] - Fix Shutdown Handling and Thread Expansion

### Backend Changes (main.go)
- Updated `searchMessages()` to accept `searchRaw` parameter for filtering search scope
- Search now checks both raw content and AI summaries by default
- Added child count display in node metadata

### Frontend Changes (app.js & index.html)
- Added `loadNodeAndChildren()` function to load content for nodes and descendants recursively
- Updated expand icon handler to load entire thread when expanding
- Updated content click handler to load content before opening editor
- Added `searchModeRaw` variable and `toggleSearchMode()` function
- Added `displayModeRaw` variable and `toggleDisplayMode()` function
- Updated `renderTree()` to load content when expanding nodes
- Updated `expandAll()` to load content for all expanded nodes
- Added console warnings for missing child nodes during expansion
- Added "Raw only" search toggle in toolbar
- Added "Show raw" display toggle in toolbar
- Enhanced createNodeElement to display child count

### Configuration Changes
- No changes to configuration structures

### Usage
- **Stop server**: Press Ctrl+C OR type "exit"/"quit"/"q" in console
- **Search mode**: Toggle "Raw only" to search only actual messages (default searches both raw and summary)
- **Display mode**: Toggle "Show raw" to display raw messages in listings instead of summaries
- **Expand thread**: Click ▶ icon to expand and load content for entire conversation thread
- **View content**: Click on node to load content (if not loaded) and open in editor panel


