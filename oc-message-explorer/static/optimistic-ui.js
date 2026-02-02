class OptimisticUI {
  constructor() {
    this.pendingOperations = new Map();
    this.operationIdCounter = 0;
    this.showIndicator = this.showIndicator.bind(this);
    this.hideIndicator = this.hideIndicator.bind(this);
  }

  generateId() {
    return `op-${Date.now()}-${this.operationIdCounter++}`;
  }

  async execute({
    id = this.generateId(),
    optimisticAction = null,
    serverAction = null,
    rollbackAction = null,
    showError = true,
    showPendingIndicator = false
  }) {
    if (this.pendingOperations.has(id)) {
      console.warn(`Operation ${id} already pending`);
      return null;
    }

    const operation = {
      id,
      status: 'pending',
      startTime: Date.now()
    };

    this.pendingOperations.set(id, operation);

    try {
      if (optimisticAction) {
        await optimisticAction();
      }

      if (showPendingIndicator) {
        this.showIndicator(id);
      }

      if (serverAction) {
        const result = await serverAction();
        operation.status = 'success';
        operation.result = result;
        return result;
      }

      operation.status = 'success';
      return null;
    } catch (error) {
      operation.status = 'error';
      operation.error = error;
      console.error(`Optimistic operation ${id} failed:`, error);

      if (rollbackAction) {
        try {
          await rollbackAction();
        } catch (rollbackError) {
          console.error(`Rollback for operation ${id} failed:`, rollbackError);
        }
      }

      if (showError) {
        this.showError(error);
      }

      throw error;
    } finally {
      if (showPendingIndicator) {
        this.hideIndicator(id);
      }
      this.pendingOperations.delete(id);
    }
  }

  showIndicator(operationId) {
    const existing = document.getElementById(`optimistic-indicator-${operationId}`);
    if (existing) return;

    const indicator = document.createElement('div');
    indicator.id = `optimistic-indicator-${operationId}`;
    indicator.className = 'optimistic-indicator';
    indicator.innerHTML = `
      <div class="optimistic-spinner"></div>
      <span class="optimistic-text">Saving...</span>
    `;
    document.body.appendChild(indicator);
  }

  hideIndicator(operationId) {
    const indicator = document.getElementById(`optimistic-indicator-${operationId}`);
    if (indicator) {
      indicator.classList.add('fade-out');
      setTimeout(() => indicator.remove(), 300);
    }
  }

  showError(error) {
    showNotification('Operation failed. Please try again.', 'error');
  }

  isPending(operationId) {
    return this.pendingOperations.has(operationId);
  }

  getPendingCount() {
    return this.pendingOperations.size;
  }

  cancelAll() {
    console.warn('Cancelling all pending operations');
    this.pendingOperations.forEach((op, id) => {
      const indicator = document.getElementById(`optimistic-indicator-${id}`);
      if (indicator) indicator.remove();
    });
    this.pendingOperations.clear();
  }
}

const optimisticUI = new OptimisticUI();
