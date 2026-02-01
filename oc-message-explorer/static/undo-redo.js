class UndoRedoManager {
  constructor(maxHistory = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
    this.currentPosition = -1;
    
    this.init();
  }

  init() {
    this.setupKeyboardShortcuts();
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey || e.altKey)) {
        if (!e.shiftKey && e.key === 'z') {
          e.preventDefault();
          this.undo();
        } else if (e.key === 'y' || (e.shiftKey && e.key === 'z')) {
          e.preventDefault();
          this.redo();
        }
      }
    });
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  pushAction(action) {
    if (!action || !action.execute || !action.undo) {
      throw new Error('Action must have execute() and undo() methods');
    }

    const actionWithMetadata = {
      ...action,
      timestamp: Date.now(),
      id: this.generateActionId()
    };

    this.undoStack.push(actionWithMetadata);
    this.redoStack = [];

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this.updateUI();
  }

  generateActionId() {
    return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async undo() {
    if (!this.canUndo()) {
      showNotification('Nothing to undo', 'info');
      return false;
    }

    const action = this.undoStack.pop();
    
    try {
      await action.undo();
      this.redoStack.push(action);
      
      showNotification(`Undone: ${action.description}`, 'info');
      this.updateUI();
      
      return true;
    } catch (error) {
      console.error('Undo failed:', error);
      this.undoStack.push(action);
      showNotification('Undo failed', 'error');
      return false;
    }
  }

  async redo() {
    if (!this.canRedo()) {
      showNotification('Nothing to redo', 'info');
      return false;
    }

    const action = this.redoStack.pop();
    
    try {
      await action.execute();
      this.undoStack.push(action);
      
      showNotification(`Redone: ${action.description}`, 'info');
      this.updateUI();
      
      return true;
    } catch (error) {
      console.error('Redo failed:', error);
      this.redoStack.push(action);
      showNotification('Redo failed', 'error');
      return false;
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateUI();
  }

  updateUI() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
      undoBtn.disabled = !this.canUndo();
      undoBtn.style.opacity = this.canUndo() ? '1' : '0.5';
    }

    if (redoBtn) {
      redoBtn.disabled = !this.canRedo();
      redoBtn.style.opacity = this.canRedo() ? '1' : '0.5';
    }
  }

  getHistory() {
    return this.undoStack.map(action => ({
      id: action.id,
      description: action.description,
      timestamp: action.timestamp
    }));
  }
}

const undoRedoManager = new UndoRedoManager();

window.undoRedoManager = undoRedoManager;
