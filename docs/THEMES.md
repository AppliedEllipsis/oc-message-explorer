# Themes Guide

This guide explains the theme system architecture and provides instructions for creating custom themes for OC Message Explorer.

## Overview

OC Message Explorer uses a CSS custom properties (CSS variables) based theming system. Each theme is defined by a JSON manifest file that specifies color values, UI properties, and metadata.

## Theme Structure

```
static/themes/
├── themes.json              # Theme registry (lists all available themes)
├── base/
│   └── base.css            # Base styles and CSS variable definitions
├── github-dark/
│   ├── theme-manifest.json # Theme configuration
│   └── theme.css           # Theme-specific CSS (optional)
├── notion/
│   └── theme-manifest.json
├── terminal/
│   └── theme-manifest.json
└── ...
```

## Theme Manifest Format

The `theme-manifest.json` file defines a theme:

```json
{
  "$schema": "https://opencode.gg/oc-message-explorer/theme-manifest.schema.json",
  "name": "My Theme",
  "id": "my-theme",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Brief description of your theme",
  "type": "light",
  "extends": "base",
  "preview": "my-theme.png",
  "cssVariables": {
    "bg-primary": "#111111",
    "bg-secondary": "#161616",
    "bg-tertiary": "#212121",
    "bg-hover": "#2a2a2a",
    "text-primary": "#ffffff",
    "text-secondary": "#a0a0a0",
    "text-muted": "#707070",
    "accent": "#38bdf8",
    "accent-hover": "#0ea5e9",
    "border": "#333333",
    "success": "#22c55e",
    "danger": "#ef4444",
    "warning": "#f59e0b"
  },
  "ui": {
    "fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "borderRadius": "6px",
    "transitionDuration": "0.15s"
  },
  "overrides": {
    ".custom-class": "color: #ff0000;"
  }
}
```

## Field Descriptions

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable theme name |
| `id` | string | Unique identifier (lowercase, alphanumeric, hyphens) |
| `version` | string | Semantic version (e.g., `1.0.0`) |
| `cssVariables` | object | CSS custom property mappings |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Theme author name or organization |
| `description` | string | Brief description of the theme |
| `type` | string | Theme type: `light`, `dark`, or `base` |
| `extends` | string | ID of theme to extend (for inheritance) |
| `abstract` | boolean | If true, theme is abstract and cannot be applied |
| `preview` | string | Preview image filename |
| `ui` | object | UI-specific properties (font, radius, transitions) |
| `overrides` | object | Component-specific CSS overrides |

## CSS Variables

The following CSS variables must be defined in `cssVariables`:

| Variable | Usage | Example |
|----------|-------|---------|
| `bg-primary` | Main background color | `#111111` |
| `bg-secondary` | Secondary background (cards, panels) | `#161616` |
| `bg-tertiary` | Tertiary background (inputs, subtle areas) | `#212121` |
| `bg-hover` | Hover state background | `#2a2a2a` |
| `text-primary` | Main text color | `#ffffff` |
| `text-secondary` | Secondary text color (labels, muted) | `#a0a0a0` |
| `text-muted` | Muted text color (placeholders, hints) | `#707070` |
| `accent` | Primary accent color (buttons, links) | `#38bdf8` |
| `accent-hover` | Hover state for accent color | `#0ea5e9` |
| `border` | Border color | `#333333` |
| `success` | Success indicator color | `#22c55e` |
| `danger` | Danger/error indicator color | `#ef4444` |
| `warning` | Warning indicator color | `#f59e0b` |

## Creating a Custom Theme

### Step 1: Create Theme Directory

```bash
mkdir static/themes/my-awesome-theme
```

### Step 2: Create Theme Manifest

Create `static/themes/my-awesome-theme/theme-manifest.json`:

```json
{
  "name": "My Awesome Theme",
  "id": "my-awesome-theme",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "A beautiful custom theme",
  "type": "dark",
  "cssVariables": {
    "bg-primary": "#0d0d0d",
    "bg-secondary": "#1a1a1a",
    "bg-tertiary": "#262626",
    "bg-hover": "#333333",
    "text-primary": "#f5f5f5",
    "text-secondary": "#a3a3a3",
    "text-muted": "#737373",
    "accent": "#6366f1",
    "accent-hover": "#4f46e5",
    "border": "#404040",
    "success": "#10b981",
    "danger": "#ef4444",
    "warning": "#f59e0b"
  }
}
```

### Step 3: Register Theme

Add your theme to `static/themes/themes.json`:

```json
{
  "version": "1.0.0",
  "themes": [
    {
      "id": "github-dark",
      "name": "GitHub Dark",
      "type": "dark",
      "manifest": "/static/themes/github-dark/theme-manifest.json",
      "css": "/static/themes/github-dark/theme.css"
    },
    {
      "id": "my-awesome-theme",
      "name": "My Awesome Theme",
      "type": "dark",
      "manifest": "/static/themes/my-awesome-theme/theme-manifest.json",
      "css": "/static/themes/base/base.css"
    }
  ]
}
```

### Step 4: Test Your Theme

1. Start the application: `go run .`
2. Open the browser
3. Click the "Theme 🎨" button in the toolbar
4. Select your theme from the dropdown

## Theme Type Guidelines

### Light Themes
- High contrast with light backgrounds
- Dark text (`#1a1a1a` or darker)
- Soft shadows and subtle borders
- Examples: Notion, Bento, Paper

### Dark Themes
- Low contrast with dark backgrounds
- Light text (`#e6edf3` or lighter)
- Glowing accents or muted borders
- Examples: GitHub Dark, Terminal, Cyberpunk

## Color Contrast Requirements

To ensure accessibility (WCAG 2.1 AA):

- Text on background: Must have contrast ratio ≥ 4.5:1
- Large text: Must have contrast ratio ≥ 3:1
- UI components: Must have visible border/background separation

Use online tools like [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) to verify your colors.

## Best Practices

1. **Choose a distinctive color palette** - Ensure your theme is visually unique
2. **Maintain consistency** - Keep related colors in harmony
3. **Test in different contexts** - Ensure text is readable on all backgrounds
4. **Test in both light/dark modes** - If creating a light theme, test in bright environments
5. **Use semantic colors** - Keep success green, danger red, warning yellow
6. **Optimize for comfort** - Avoid overly saturated colors that cause eye strain

## Theme Inheritance

Themes can extend other themes using the `extends` field:

```json
{
  "name": "My Variant Theme",
  "id": "my-variant-theme",
  "extends": "github-dark",
  "cssVariables": {
    "accent": "#ff00ff"  // Only override what you need
  }
}
```

This allows you to create variants without duplicating the entire config.

## CSS Overrides

For advanced customization, use the `overrides` field:

```json
{
  "overrides": {
    ".node-content": {
      "border-radius": "4px",
      "padding": "8px 16px"
    },
    ".btn.primary": {
      "box-shadow": "0 2px 8px rgba(0,0,0,0.2)"
    }
  }
}
```

**Note:** CSS overrides are applied directly as CSS rules. Use sparingly as they may require updates when the application UI changes.

## Troubleshooting

### Theme not appearing in dropdown
- Verify theme is registered in `static/themes/themes.json`
- Check `manifest.json` syntax is valid JSON
- Ensure `id` field matches the one in `themes.json`

### Colors not applying
- Verify `cssVariables` object is correctly formatted
- Check browser console for validation errors
- Ensure all required CSS variables are defined

### Theme loading slowly
- Theme files should be small (< 10KB each)
- Avoid large images in preview files
- Consider using inline colors instead of separate CSS files

## Additional Resources

- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Color Picker Tools](https://color.adobe.com/create)
