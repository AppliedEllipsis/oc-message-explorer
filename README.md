# OC Message Explorer

A tool for exploring and analyzing OpenChat messages.

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/AppliedEllipsis/oc-message-explorer.git
cd oc-message-explorer
```

### 2. Set Up Environment

```bash
# Copy the environment template
cp .env.example .env

# Edit .env and add your configuration
# Your favorite editor
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development

```bash
# Compile TypeScript
npm run compile

# Run tests
npm run test

# Watch mode for development
npm run watch
```

---

## Project Structure

```
.
├── .env.example          # Environment variables template (git-tracked)
├── .env                  # Your actual environment variables (git-ignored)
├── .gitignore            # Standard git exclusions
├── AGENTS.md             # Full AI agent development guide
├── agents.min.md         # Quick-start guide (read this first!)
├── commitlint.config.mjs # Commit message linting configuration
├── LICENSE               # MIT License
├── README.md             # This file
├── docs/
│   ├── MEMORY.md         # Query history and task tracking
│   └── memory/
│       ├── README.md                 # Shared memory system documentation
│       ├── git_commit_format.md      # Git commit message format
│       ├── shared-memory.md          # Cross-tool memory pool
│       └── tool-registry.md          # AI tool registry
├── eslint.config.mjs      # ESLint configuration
├── oc-message-explorer/  # Main application directory
├── package.json          # NPM scripts and dependencies
├── src/                  # TypeScript source files
└── tsconfig.json         # TypeScript configuration
```

---

## Features

OC Message Explorer provides powerful tools for analyzing and understanding your OpenChat conversations.

### 📊 Message Analysis

- Browse and search through OpenChat message history
- Analyze conversation patterns and trends
- Export message data for further analysis

### 🤖 AI Agent Memory System

Integrated memory system for cross-tool continuity:

- **Shared Memory Pool**: All AI tools share context and task tracking
- **Tool Registry**: Documents capabilities of different AI agents
- **Query History**: Tracks all interactions and decisions
- **Cross-Tool Handoff**: Seamlessly transition between AI tools

Files:
- [`agents.min.md`](agents.min.md) - Start here for AI agent onboarding
- [`docs/memory/shared-memory.md`](docs/memory/shared-memory.md) - Main memory pool
- [`docs/memory/tool-registry.md`](docs/memory/tool-registry.md) - Tool registry

### 📝 Enhanced Commit Messages

Standardized commit message format with emojis:

```
~ [ short up to 8 word summary ]:

<emoji> <type>(<scope>): <subject>

<body>
```

See [`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md) for details.

### 🧪 TypeScript + ESLint

- **TypeScript**: Strict type checking with comprehensive configuration
- **ESLint**: Linting with TypeScript support and custom rules
- **Pre-commit**: Automated compilation and linting before tests

### 🔒 Security

- Environment variables stored in `.env` (git-ignored)
- Template file `.env.example` for reference
- Comprehensive `.gitignore` for sensitive files

---

## Development Workflow

### Making Changes

1. **Understand current state**: Read relevant files and documentation
2. **Make small changes**: One focused change at a time
3. **Compile**: `npm run compile`
4. **Lint**: `npm run lint`
5. **Test**: `npm run test`
6. **Commit**: Use the enhanced conventional commit format

### Committing Changes

Follow the commit message format:

```bash
git add .
git commit -m "~ [ add user authentication ]:

✨ feat(auth): implement JWT-based authentication

- add login and registration endpoints
- implement token refresh mechanism
- secure routes with JWT validation"
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Compile TypeScript to `out/` directory |
| `npm run watch` | Watch mode for development |
| `npm run lint` | Run ESLint on TypeScript files |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run test` | Run test suite |
| `npm run pretest` | Compile + lint + test (pre-commit) |
| `npm run buildrelease` | Version bump + compile |

---

## Configuration

### TypeScript

See [`tsconfig.json`](tsconfig.json) for TypeScript configuration:
- Strict type checking enabled
- Source maps generated
- Declaration files created
- ES2022 target

### ESLint

See [`eslint.config.mjs`](eslint.config.mjs) for linting rules:
- TypeScript strict mode
- No unused variables
- No implicit any
- Custom globals for Node.js

### Commitlint

See [`commitlint.config.mjs`](commitlint.config.mjs) for commit linting
- Conventional commit format
- Type validation
- Header length limits

---

## AI Agents

This project includes support for multiple AI agent tools:

- **Kilocode**: Automated memory tracking
- **Roocode**: Memory system discovery pending
- **Opencode**: File operations and web tools
- **Amp**: Discovery pending
- **Gemini**: Discovery pending
- **Claude**: Discovery pending
- **Antigravity**: Discovery pending

All tools use the shared memory system for continuity across sessions.

**For AI agents**: Start by reading [`agents.min.md`](agents.min.md)!

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# API configuration
API_ENDPOINT=https://api.example.com/v1

# Test API key
TEST_API_KEY=your_test_api_key_here

# Node environment
NODE_ENV=development

# Debug mode
DEBUG=false

# Request timeout (ms)
TIMEOUT=30000
```

**Important**: Never commit `.env` to version control!

---

## Documentation

### Quick Start

1. **`README.md`** ← You are here (this file)
2. **`agents.min.md`** - AI agent quick-start guide
3. **`docs/memory/shared-memory.md`** - Cross-tool context

### Full Documentation

- **[`AGENTS.md`](AGENTS.md)** - Complete AI agent development guide
- **[`agents.min.md`](agents.min.md)** - Optimized quick-start guide
- **[`docs/MEMORY.md`](docs/MEMORY.md)** - Query history and task tracking
- **[`docs/memory/README.md`](docs/memory/README.md)** - Shared memory system
- **[`docs/memory/shared-memory.md`](docs/memory/shared-memory.md)** - Memory pool
- **[`docs/memory/tool-registry.md`](docs/memory/tool-registry.md)** - Tool registry
- **[`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md)** - Commit format

---

## License

MIT License - See [`LICENSE`](LICENSE) file for details.

---

## Support

For questions about:
- **Commit messages**: See [`docs/memory/git_commit_format.md`](docs/memory/git_commit_format.md)
- **AI agents**: See [`agents.min.md`](agents.min.md) or [`AGENTS.md`](AGENTS.md)
- **Memory system**: See [`docs/memory/README.md`](docs/memory/README.md)

---

**Happy coding! 🚀**
