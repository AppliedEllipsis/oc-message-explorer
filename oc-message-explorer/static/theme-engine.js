class ThemeEngine {
  constructor() {
    this.currentTheme = null;
    this.themeCache = new Map();
    this.STORAGE_KEY = 'theme-preference';
    this.THEMES_DIR = '/static/themes/';
    this.defaults = {
      themeId: 'github-dark'
    };
  }

  async init() {
    try {
      const savedTheme = localStorage.getItem(this.STORAGE_KEY);
      const themeId = savedTheme || await this.fetchDefaultTheme();
      await this.loadTheme(themeId);
    } catch (error) {
      console.error('Theme initialization failed:', error);
      await this.loadTheme(this.defaults.themeId);
    }
  }

  async fetchDefaultTheme() {
    try {
      const response = await fetch('/api/settings/theme');
      if (response.ok) {
        const data = await response.json();
        return data.themeId || this.defaults.themeId;
      }
    } catch (error) {
      console.warn('Failed to fetch default theme from server:', error);
    }
    return this.defaults.themeId;
  }

  async loadTheme(themeId) {
    if (themeId === this.currentTheme?.id) {
      return;
    }

    const startTime = performance.now();

    try {
      const manifest = await this.fetchThemeManifest(themeId);
      this.applyThemeVariables(manifest.cssVariables);
      this.applyUIProperties(manifest.ui);
      
      this.currentTheme = manifest;
      this.persistTheme(themeId);
      
      this.dispatchEvent('themeChanged', { themeId, manifest });
      
      const elapsed = performance.now() - startTime;
      console.log(`Theme loaded in ${elapsed.toFixed(2)}ms`);
    } catch (error) {
      console.error(`Failed to load theme "${themeId}":`, error);
      throw error;
    }
  }

  async fetchThemeManifest(themeId) {
    if (this.themeCache.has(themeId)) {
      return this.themeCache.get(themeId);
    }

    const url = `${this.THEMES_DIR}${themeId}/theme-manifest.json`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch theme manifest from ${url}`);
    }

    const manifest = await response.json();
    this.validateManifest(manifest);
    this.themeCache.set(themeId, manifest);
    
    return manifest;
  }

  validateManifest(manifest) {
    const required = ['name', 'id', 'cssVariables'];
    const missing = required.filter(field => !manifest[field]);
    
    if (missing.length > 0) {
      throw new Error(`Invalid theme manifest: missing required fields: ${missing.join(', ')}`);
    }

    if (!manifest.id.match(/^[a-z0-9-]+$/)) {
      throw new Error(`Invalid theme ID: "${manifest.id}" must contain only lowercase letters, numbers, and hyphens`);
    }
  }

  applyThemeVariables(cssVariables) {
    const root = document.documentElement;
    
    for (const [key, value] of Object.entries(cssVariables)) {
      root.style.setProperty(`--${key}`, value);
    }
  }

  applyUIProperties(ui) {
    if (!ui) return;

    const root = document.documentElement;

    if (ui.fontFamily) {
      root.style.setProperty('--font-family', ui.fontFamily);
    }

    if (ui.borderRadius) {
      root.style.setProperty('--border-radius', ui.borderRadius);
    }

    if (ui.transitionDuration) {
      root.style.setProperty('--transition-duration', ui.transitionDuration);
    }
  }

  persistTheme(themeId) {
    try {
      localStorage.setItem(this.STORAGE_KEY, themeId);
    } catch (error) {
      console.warn('Failed to persist theme to localStorage:', error);
    }
  }

  async switchTheme(themeId) {
    const startTime = performance.now();
    await this.loadTheme(themeId);
    
    try {
      await fetch('/api/settings/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId })
      });
    } catch (error) {
      console.warn('Failed to save theme preference to server:', error);
    }

    return performance.now() - startTime;
  }

  getCurrentTheme() {
    return this.currentTheme;
  }

  getAllCachedThemes() {
    return Array.from(this.themeCache.values());
  }

  addEventListener(event, callback) {
    this._listeners = this._listeners || {};
    this._listeners[event] = this._listeners[event] || [];
    this._listeners[event].push(callback);
  }

  removeEventListener(event, callback) {
    if (!this._listeners || !this._listeners[event]) return;
    
    const index = this._listeners[event].indexOf(callback);
    if (index > -1) {
      this._listeners[event].splice(index, 1);
    }
  }

  dispatchEvent(event, data) {
    if (!this._listeners || !this._listeners[event]) return;
    
    for (const callback of this._listeners[event]) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Theme event listener error for "${event}":`, error);
      }
    }
  }

  reset() {
    this.currentTheme = null;
    this.themeCache.clear();
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

window.themeEngine = new ThemeEngine();
