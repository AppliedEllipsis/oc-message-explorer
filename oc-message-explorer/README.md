# OC Message Explorer

A lightweight, self-contained Golang webapp that **loads your actual OpenChat message history** and displays it in a browsable tree-view interface. Features lazy loading, fuzzy search, and memory-efficient browsing.

## Description

This app directly reads your OpenChat message history and displays it. It helps you:
- **Browse ALL your OpenChat messages** (like pressing up arrow navigation)
- See complete conversation history with prompts and responses
- Quickly find and copy past prompts/cherry-pick from history
- Verify implementations and check past work
- Combine multiple messages and copy to clipboard
- Organize messages into custom folders/projects
- Search through all your OpenChat conversations with fuzzy matching
- **Use minimal memory** with lazy loading

## Key Features

**OpenChat Integration:**
- **Auto-loads** your OpenChat message history on startup
- Reads from `%USERPROFILE%\.local\share\opencode` on Windows
- Loads all sessions, prompts, and responses
- Preserves full content from message parts
- Shows metadata: role, timestamp, agent, session

**Lazy Loading & Memory:**
- **Default: Collapsed** - All messages start collapsed to save memory
- **Lazy content loading** - Full content loads only when you expand or click
- **Preview mode** - Shows first 100 characters initially, loads full content on demand
- **Fuzzy search** - Handles misspellings and typos (e.g., "promt" matches "prompt")
- **Debounced search** - 300ms delay to avoid unnecessary searches

**Message Management:**
- **Tree-View Interface**: Visualize prompts and responses hierarchically
- **Message Selection**: Checkboxes for multi-select
- **Combine & Copy**: Copy selected messages to clipboard instantly
- **Inline Editor**: Edit prompts, responses, and tags in browser
- **Drag & Drop**: Reorder messages in tree
- **Tagging System**: Organize with custom tags
- **Search**: Fuzzy search handles misspellings

**Additional Features:**
- **Real-time Updates**: WebSocket sync
- **Loading Screen**: Progress indicator while loading messages
- **URL Display**: Shows clickable URL in terminal (no auto-browser)
- **Import/Export**: Save/load message collections
- **Responsive Design**: Dark-themed, all screen sizes
- **Reload Button**: Refresh to load new OpenChat messages

## Installation

1. Navigate to `oc-message-explorer` directory
2. Build application:
   ```bash
   go build -ldflags="-s -w" -o oc-message-explorer.exe .
   ```
   On Linux/Mac:
   ```bash
   go build -ldflags="-s -w" -o oc-message-explorer .
   ```

## Usage

Run application:
```bash
./oc-message-explorer.exe
```

Or on Windows, double-click `run.bat`

The app will:
1. Display server URL in your terminal
2. Show a loading screen with progress indicator while reading messages
3. Click URL in your terminal to open in your browser
4. Load all your OpenChat messages automatically

## How It Works

1. **Launch**: Run app - it shows a clickable URL in terminal
2. **Loading Screen**: App reads OpenChat messages with progress indicator
3. **Auto-load**: Reads from OpenChat storage directory (metadata only initially)
4. **Browse**: "All Messages" view shows all conversations in a tree (collapsed)
5. **Expand**: Click ▶ to expand - loads full content on demand
6. **Search**: Type to filter with fuzzy matching (handles typos)
7. **Copy**: Check messages you want, click "Copy Selected"
8. **Edit**: Click any message to edit (creates copy in your collection)
9. **Organize**: Create folders to organize by project/topic
10. **Reload**: Click "🔄 Reload" to load new OpenChat messages

## Loading Process

When you start the app:
1. Server starts and shows URL in terminal (e.g., `http://127.0.0.1:57196`)
2. Loading screen appears with spinner and status messages
3. Progress bar shows as it reads sessions and messages
4. Once complete, loading screen disappears and messages appear
5. Click URL in your terminal to open browser

You'll see progress like:
- "Found 15 sessions, reading messages..."
- "Read 5/15 sessions..."
- "✓ Complete - Loaded 1100 messages from 15 sessions"

## Memory & Performance

**Lazy Loading:**
- **Collapsed by default** - All messages start collapsed for memory efficiency
- **On-demand content** - Full message content only loads when you expand a node
- **Preview mode** - Shows first 100 chars of content initially
- **Efficient** - Can handle 1000+ messages without loading all content upfront

**Fuzzy Search:**
- **Misspellings handled** - "promt" matches "prompt", "mssage" matches "message"
- **Character matching** - Searches sequentially through text
- **Tag searching** - Also searches through tags
- **Debounced** - 300ms delay prevents excessive searches while typing

**Memory Benefits:**
- Only message metadata loads initially (IDs, types, titles, timestamps)
- Full content loads only when needed (expanding or editing)
- Can browse thousands of messages with minimal memory usage
- Preview text prevents loading large responses accidentally

## Data Structure

The app reads OpenChat's actual storage format:

```
~/.local/share/opencode/
└── storage/
    ├── message/
    │   └── <sessionID>/
    │       └── msg_<msgID>.json         # Message metadata
    └── part/
        └── <msgID>/
            └── prt_<partID>.json        # Actual content
```

## Workflow

1. **Start App**: Run `./oc-message-explorer.exe`
2. **View History**: All your OpenChat messages load automatically (collapsed)
3. **Browse Messages**: Navigate tree - "All Messages" shows everything
4. **Expand to Load**: Click ▶ to expand nodes - content loads on demand
5. **Search**: Type to filter with fuzzy matching (handles typos)
6. **Select & Copy**: Check messages you want → Click "Copy Selected"
7. **Organize**: Create folders to organize by project/topic
8. **Export**: Save your organized collection to JSON
9. **Reload**: Click "🔄 Reload" to load new OpenChat messages

## Keyboard Shortcuts

- `Ctrl+N`: Create new message
- `Ctrl+E`: Save current edit
- `Ctrl+S`: Export data
- `Ctrl+F`: Focus search box
- `Escape`: Close modals or editor

## Configuration

**Custom OpenChat Path:**

If your OpenChat data is in a non-standard location, set the environment variable:

```bash
# Windows
set OPENCODE_DATA_DIR=C:\path\to\opencode

# Linux/Mac
export OPENCODE_DATA_DIR=/path/to/opencode
```

## API Endpoints

- `GET /api/folders` - List all folders
- `POST /api/folders` - Create folder
- `PUT /api/folders/{id}` - Update folder
- `DELETE /api/folders/{id}` - Delete folder
- `GET /api/messages` - Get all messages
- `GET /api/messages/{nodeId}` - Load message content (lazy load)
- `POST /api/messages` - Create message
- `PUT /api/messages/{nodeId}` - Update message
- `DELETE /api/messages/{nodeId}` - Delete message
- `POST /api/search` - Fuzzy search (handles misspellings)
- `POST /api/reorder` - Reorder message
- `POST /api/copy-selected` - Copy selected
- `GET /api/export` - Export as JSON
- `POST /api/import` - Import from JSON

## Project Structure

```
oc-message-explorer/
├── main.go           # Backend + OpenChat reader + Lazy loading
├── go.mod           # Go dependencies
├── run.bat          # Windows launcher
├── README.md       # This file
└── static/
    ├── index.html   # Frontend HTML
    └── app.js      # Frontend JavaScript
```

## Data Persistence

- **OpenChat Messages**: Read-only from OpenChat storage, lazy-loaded on demand
- **Your Edits/New Messages**: Stored in memory during session
- **Export**: Save your collection to JSON file
- **Import**: Restore collections from JSON

Only your custom messages and edits are saved via export. OpenChat history is read-only and refreshed on reload.

## Troubleshooting

**No messages loading:**
- Check OpenChat data directory exists at default path
- Set `OPENCODE_DATA_DIR` if using custom location
- Ensure you have read permissions to the directory
- Click "Reload" button to retry

**Messages not expanding:**
- Click ▶ icon to expand and load full content
- First 100 chars show as preview
- Full content loads from disk when expanded

**Fuzzy search not finding matches:**
- Check spelling - search is forgiving but not magic
- Try shorter search terms
- Search looks at content, type, and tags
- Debounced 300ms - wait briefly after typing

## License

MIT
