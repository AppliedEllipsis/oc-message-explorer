class CommandPalette {
  constructor() {
    this.isVisible = false;
    this.commands = [];
    this.selectedIndex = 0;
    this.searchQuery = '';
    this.panel = null;
    this.searchInput = null;
    this.resultsList = null;
    
    this.init();
  }

  init() {
    this.createPanel();
    this.registerCommands();
    this.setupEventListeners();
  }

  createPanel() {
    const panel = document.createElement('div');
    panel.id = 'commandPalette';
    panel.className = 'command-palette';
    panel.innerHTML = `
      <div class="command-palette-overlay" id="commandPaletteOverlay"></div>
      <div class="command-palette-container">
        <div class="command-palette-header">
          <input 
            type="text" 
            id="commandPaletteInput" 
            class="command-palette-input" 
            placeholder="Search commands..."
            autocomplete="off"
          >
        </div>
        <div class="command-palette-results" id="commandPaletteResults"></div>
        <div class="command-palette-footer">
          <span class="command-shortcut">↑↓ to navigate</span>
          <span class="command-shortcut">Enter to select</span>
          <span class="command-shortcut">Esc to close</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    this.panel = panel;
    this.searchInput = document.getElementById('commandPaletteInput');
    this.resultsList = document.getElementById('commandPaletteResults');
  }

  registerCommands() {
    this.commands = [
      {
        id: 'search',
        name: 'Search messages',
        icon: '🔍',
        shortcut: 'Ctrl+Shift+F',
        description: 'Search through all messages',
        action: () => {
          const searchBox = document.getElementById('searchBox');
          if (searchBox) {
            searchBox.focus();
            searchBox.select();
          }
        }
      },
      {
        id: 'new-folder',
        name: 'Create new folder',
        icon: '📁',
        shortcut: 'Ctrl+N',
        description: 'Create a new message folder',
        action: () => {
          showNewFolderModal();
        }
      },
      {
        id: 'new-prompt',
        name: 'Create new prompt',
        icon: '✨',
        shortcut: 'Ctrl+P',
        description: 'Create a new prompt message',
        action: () => {
          showNewMessageModal('prompt');
        }
      },
      {
        id: 'expand-all',
        name: 'Expand all',
        icon: '📂',
        shortcut: 'Ctrl+E',
        description: 'Expand all collapsed nodes',
        action: () => {
          expandAll();
        }
      },
      {
        id: 'collapse-all',
        name: 'Collapse all',
        icon: '📦',
        shortcut: 'Ctrl+Shift+E',
        description: 'Collapse all expanded nodes',
        action: () => {
          collapseAll();
        }
      },
      {
        id: 'reload-data',
        name: 'Reload data',
        icon: '🔄',
        shortcut: 'Ctrl+R',
        description: 'Reload messages from OpenChat',
        action: () => {
          reloadData();
        }
      },
      {
        id: 'export-data',
        name: 'Export data',
        icon: '📤',
        shortcut: 'Ctrl+E',
        description: 'Export all messages to JSON',
        action: () => {
          exportData();
        }
      },
      {
        id: 'import-data',
        name: 'Import data',
        icon: '📥',
        shortcut: 'Ctrl+I',
        description: 'Import messages from JSON',
        action: () => {
          document.getElementById('importFile').click();
        }
      },
      {
        id: 'settings',
        name: 'Open settings',
        icon: '⚙️',
        shortcut: 'Ctrl+,',
        description: 'Open settings modal',
        action: () => {
          showSettingsModal();
        }
      },
      {
        id: 'theme',
        name: 'Change theme',
        icon: '🎨',
        shortcut: 'Ctrl+T',
        description: 'Open theme selector',
        action: () => {
          toggleThemePanel();
        }
      },
      {
        id: 'unselect-all',
        name: 'Unselect all',
        icon: '✅',
        shortcut: 'Ctrl+D',
        description: 'Deselect all messages',
        action: () => {
          unselectAll();
        }
      },
      {
        id: 'copy-selected',
        name: 'Copy selected',
        icon: '📋',
        shortcut: 'Ctrl+C',
        description: 'Copy selected messages to clipboard',
        action: () => {
          copySelected();
        }
      },
      {
        id: 'combine',
        name: 'Combine messages',
        icon: '🔗',
        shortcut: 'Ctrl+Shift+C',
        description: 'Combine selected messages',
        action: () => {
          showCombineModal();
        }
      },
      {
        id: 'view-agents',
        name: 'View AGENTS.md',
        icon: '🤖',
        shortcut: 'Ctrl+A',
        description: 'View AI agent documentation',
        action: () => {
          showAgentsModal();
        }
      },
      {
        id: 'toggle-options',
        name: 'Toggle options panel',
        icon: '🎛️',
        shortcut: 'Ctrl+O',
        description: 'Show/hide filter options',
        action: () => {
          toggleOptionsPanel();
        }
      },
      {
        id: 'clear-search',
        name: 'Clear search',
        icon: '❌',
        shortcut: 'Ctrl+L',
        description: 'Clear search query and filters',
        action: () => {
          const searchBox = document.getElementById('searchBox');
          if (searchBox) {
            searchBox.value = '';
            searchQuery = '';
            renderTree();
          }
          clearTagFilter();
        }
      }
    ];
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        this.toggle();
      }
    });

    const overlay = document.getElementById('commandPaletteOverlay');
    overlay.addEventListener('click', () => this.hide());

    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderResults();
    });

    this.searchInput.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.navigate(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigate(-1);
          break;
        case 'Enter':
          e.preventDefault();
          this.executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
      }
    });
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.isVisible = true;
    this.panel.classList.add('visible');
    this.searchInput.value = '';
    this.searchQuery = '';
    this.selectedIndex = 0;
    
    setTimeout(() => {
      this.searchInput.focus();
      this.renderResults();
    }, 10);
  }

  hide() {
    this.isVisible = false;
    this.panel.classList.remove('visible');
  }

  navigate(direction) {
    const results = this.getFilteredCommands();
    this.selectedIndex = Math.max(0, Math.min(results.length - 1, this.selectedIndex + direction));
    this.highlightSelected();
  }

  highlightSelected() {
    const items = this.resultsList.querySelectorAll('.command-palette-item');
    items.forEach((item, index) => {
      item.classList.toggle('active', index === this.selectedIndex);
    });

    const selectedItem = items[this.selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  executeSelected() {
    const results = this.getFilteredCommands();
    if (results[this.selectedIndex]) {
      const command = results[this.selectedIndex];
      this.hide();
      setTimeout(() => command.action(), 10);
    }
  }

  getFilteredCommands() {
    if (!this.searchQuery) {
      return this.commands;
    }

    const query = this.searchQuery.toLowerCase();
    return this.commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.id.includes(query)
    );
  }

  renderResults() {
    const results = this.getFilteredCommands();
    
    if (results.length === 0) {
      this.resultsList.innerHTML = `
        <div class="command-palette-empty">
          <div class="command-palette-empty-icon">🔍</div>
          <div class="command-palette-empty-text">No commands found</div>
        </div>
      `;
      return;
    }

    this.resultsList.innerHTML = results.map((cmd, index) => `
      <div class="command-palette-item ${index === this.selectedIndex ? 'active' : ''}" 
           data-index="${index}"
           onclick="window.commandPalette.executeByIndex(${index})">
        <div class="command-palette-item-icon">${cmd.icon}</div>
        <div class="command-palette-item-content">
          <div class="command-palette-item-name">${this.highlightMatch(cmd.name)}</div>
          <div class="command-palette-item-description">${cmd.description}</div>
        </div>
        ${cmd.shortcut ? `<div class="command-palette-item-shortcut">${cmd.shortcut}</div>` : ''}
      </div>
    `).join('');
  }

  executeByIndex(index) {
    const results = this.getFilteredCommands();
    if (results[index]) {
      this.hide();
      setTimeout(() => results[index].action(), 10);
    }
  }

  highlightMatch(text) {
    if (!this.searchQuery) return text;
    
    const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

window.commandPalette = new CommandPalette();
