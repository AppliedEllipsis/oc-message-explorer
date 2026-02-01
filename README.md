# OC Message Explorer

A lightweight, self-contained Golang web application that loads and displays your OpenChat message history in a browsable tree-view interface.

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/AppliedEllipsis/oc-message-explorer.git
cd oc-message-explorer
```

### 2. Build the Application

Navigate to the `oc-message-explorer` directory and build:

```bash
cd oc-message-explorer

# Windows
go build -ldflags="-s -w" -o oc-message-explorer.exe .

# Linux/Mac
go build -ldflags="-s -w" -o oc-message-explorer .
```

### 3. Run the Application

```bash
# Windows
./oc-message-explorer.exe

# Or double-click run.bat

# Linux/Mac
./oc-message-explorer
```

The app will:
1. Display server URL in your terminal (e.g., `http://127.0.0.1:57196`)
2. Auto-open your browser (use `--no-browser` flag to disable)
3. Load your OpenChat messages automatically

---

## Documentation

### Main Application Documentation

- **[`oc-message-explorer/README.md`](oc-message-explorer/README.md)** - Complete OC Message Explorer documentation
  - Features and capabilities
  - Installation and usage instructions
  - API endpoints
  - Troubleshooting guide

### AI Agent Memory System

This project includes an AI agent memory system for cross-tool continuity:

- **[`agents.min.md`](agents.min.md)** - Quick-start guide for AI agents (read this first!)
- **[`AGENTS.md`](AGENTS.md)** - Full AI agent development guide
- **[`docs/memory/shared-memory.md`](docs/memory/shared-memory.md)** - Cross-tool memory pool
- **[`docs/memory/tool-registry.md`](docs/memory/tool-registry.md)** - AI tool registry

---

## Project Structure

```
.
├── oc-message-explorer/          # Main Go application
│   ├── main.go                # Backend + OpenChat reader
│   ├── db.go                  # SQLite database layer
│   ├── sync.go                # Sync manager
│   ├── go.mod/go.sum          # Go dependencies
│   ├── static/                # Frontend files
│   │   ├── index.html        # HTML UI
│   │   └── app.js           # JavaScript logic
│   └── README.md             # App documentation
├── docs/                     # Documentation
│   ├── MEMORY.md             # Query history and task tracking
│   └── memory/
│       ├── README.md                 # Shared memory system
│       ├── shared-memory.md          # Memory pool
│       ├── tool-registry.md          # AI tool registry
│       └── git_commit_format.md      # Commit format
├── agents.min.md             # AI agent quick-start guide
├── AGENTS.md                # Full AI agent development guide
└── README.md                # This file
```

---

## Features

### 📊 Message Analysis

- Browse and search through OpenChat message history
- Lazy loading for memory-efficient browsing
- Tree-view interface for conversation hierarchy
- Fuzzy search with typo handling
- Combine and copy multiple messages

### 🤖 AI Agent Memory System

Integrated memory system for cross-tool continuity:

- **Shared Memory Pool**: All AI tools share context and task tracking
- **Tool Registry**: Documents capabilities of different AI agents
- **Query History**: Tracks all interactions and decisions
- **Cross-Tool Handoff**: Seamlessly transition between AI tools

### 💾 SQLite Caching

- Persistent message caching in SQLite database
- Non-blocking async data loading
- Show cached data immediately while syncing
- Lock state persistence across sessions

### 🎨 UI Improvements

- Prominent edit button (always visible)
- Resizable editor sidebar (300px-1200px)
- Smart click behavior (single-click to edit when editor open)
- Bigger checkbox hit areas
- Viewport-based lazy loading

### 🔒 Lock Messages

- Lock important messages to prevent accidental edits
- Lock state persists in database
- Visual indicator (🔒/🔓) on locked messages

---

## Configuration

### OpenChat Data Path

By default, the app reads from:
- **Windows**: `%USERPROFILE%\.local\share\opencode`
- **Linux/Mac**: `~/.local/share/opencode`

To use a custom path:

```bash
# Windows
set OPENCODE_DATA_DIR=C:\path\to\opencode

# Linux/Mac
export OPENCODE_DATA_DIR=/path/to/opencode
```

### Debug Mode

```bash
./oc-message-explorer.exe --no-browser
```

Prevents automatic browser opening (useful for debugging or terminal-only sessions).

---

## Scripts

### Application

| Script | Description |
|--------|-------------|
| `run.bat` | Windows launcher for the application |
| `run-debug.bat` | Debug launcher (no browser auto-open) |

### Build

```bash
cd oc-message-explorer
go build
```

---

## Environment Variables

Copy `oc-message-explorer/.env.example` to `oc-message-explorer/.env` and configure:

```bash
# OpenAI API configuration (for AI features)
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4

# Project configuration
OPENCODE_DATA_DIR=/path/to/opencode

# Server configuration
PORT=0  # 0 = auto-assign random port
```

**Important**: `.env` is git-ignored for security. Never commit API keys!

---

## API Endpoints

- `GET /api/folders` - List all folders
- `GET /api/messages` - Get all messages
- `GET /api/messages/{id}` - Load message content (lazy load)
- `POST /api/messages` - Create message
- `PUT /api/messages/{id}` - Update message
- `DELETE /api/messages/{id}` - Delete message
- `POST /api/search` - Fuzzy search
- `POST /api/copy-selected` - Copy selected messages
- `GET /api/export` - Export as JSON
- `POST /api/import` - Import from JSON
- `POST /api/sync` - Sync with OpenChat messages
- `POST /api/sync/cancel` - Cancel sync
- `PATCH /api/messages/{id}/lock` - Toggle lock state

---

## Troubleshooting

**No messages loading:**
- Check OpenChat data directory exists at default path
- Set `OPENCODE_DATA_DIR` if using custom location
- Ensure you have read permissions
- Check `.env` file exists in `oc-message-explorer/` directory

**Messages not expanding:**
- Click ▶ icon to expand and load full content
- Preview shows first 150 characters
- Full content loads from database when expanded

**Lock state not persisting:**
- Ensure SQLite database file exists: `{exeName}.db`
- Check database write permissions
- Lock state stored in `locked` column of `nodes` table

---

## AI Agents

This project supports multiple AI agent tools:

- **Kilocode**: Automated memory tracking
- **Roocode**: Memory system discovery pending
- **Opencode**: File operations and web tools
- **Amp**: Discovery pending
- **Gemini**: Discovery pending
- **Claude**: Discovery pending
- **Antigravity**: Discovery pending

All tools use shared memory system for continuity across sessions.

**For AI agents**: Start by reading [`agents.min.md`](agents.min.md)!

---

## Development

For contributing to OC Message Explorer:

1. Read [`oc-message-explorer/README.md`](oc-message-explorer/README.md) for full documentation
2. Follow the development workflow in [`AGENTS.md`](AGENTS.md)
3. Use enhanced conventional commit format (see [`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md))

### Commit Message Format

```bash
~ [ short up to 8 word summary ]:

<emoji> <type>(<scope>): <subject>

<body>
```

Example:
```bash
~ [ add SQLite caching system ]:

✨ feat(core): Add SQLite database for message caching

- Create db.go with full schema and CRUD operations
- Implement async loading with progress updates
- Add sync manager for OpenChat integration
```

---

## License

MIT License - See [`LICENSE`](LICENSE) file for details.

---

## Support

For questions about:
- **OC Message Explorer**: See [`oc-message-explorer/README.md`](oc-message-explorer/README.md)
- **Commit messages**: See [`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md)
- **AI agents**: See [`agents.min.md`](agents.min.md) or [`AGENTS.md`](AGENTS.md)
- **Memory system**: See [`docs/memory/README.md`](docs/memory/README.md)

---

**Happy coding! 🚀**
