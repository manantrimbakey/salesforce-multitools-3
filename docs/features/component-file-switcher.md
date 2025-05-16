[← Back to Documentation Home](../index.md)

# Component File Switcher

The Component File Switcher is a powerful feature that enables Salesforce developers to quickly navigate between related files within Lightning Web Component (LWC) and Aura bundles.

## Overview

When working with Lightning Web Components or Aura Components in Salesforce, each component typically consists of multiple files (.js, .html, .css, etc.). Switching between these related files traditionally requires navigating through the file explorer, which can be time-consuming.

The Component File Switcher feature solves this problem by providing:

1. A keyboard shortcut (Alt+O / Option+O on Mac) that displays a dropdown menu of related files
2. A sidebar UI that shows all component files organized by type

## Feature Navigation

- **Component File Switcher** (current page)
- [Last Modified Details](./last-modified-details.md)
- [Salesforce Connection Management](./connection-management.md)

## How It Works

### Keyboard Shortcut

When you press `Alt+O` (or `Option+O` on Mac) while editing a file that belongs to an LWC or Aura component:

1. The extension identifies all files that belong to the current component
2. It filters out the currently active file
3. It displays a QuickPick menu listing the other component files
4. Files are prioritized with main files first (primary JS file for LWC, component file for Aura)
5. Upon selection, the chosen file opens in the editor

### Sidebar UI

The sidebar provides a visual interface for navigating component files:

1. It shows the component name and type (LWC or AURA)
2. Files are grouped by type (JavaScript, HTML/Markup, CSS, etc.)
3. The currently open file is highlighted
4. Visual indicators show unsaved files
5. Clicking on any file opens it in the editor

## Features

- **File Type Recognition**: Automatically identifies and categorizes files by type
- **File Prioritization**: Lists main component files at the top
- **Unsaved Files Indicator**: Shows which files have unsaved changes
- **Real-time Updates**: The sidebar automatically updates when files change or when switching between components
- **Intuitive Highlighting**: Currently active file is clearly highlighted with contrasting colors

## Configuration

The Component File Switcher requires no additional configuration and works out of the box with any Salesforce project that follows standard LWC or Aura component structures.

## Implementation Details

### Backend Components

The extension uses several key components to implement this feature:

- **Commands**: Defines handlers for the keyboard shortcut and sidebar refresh events
- **Utils**: Provides utilities for identifying component files and their types
- **File Watcher**: Monitors changes to component directories

Key files:

- `src/features/componentFileSwitcher/commands.ts`: Handles command registration and execution
- `src/features/componentFileSwitcher/componentFileSwitcherUtils.ts`: Contains utilities for handling component files

### Frontend Components

The sidebar UI is implemented using React:

- `client/src/components/componentFileSwitcher/componentFileSwitcher.tsx`: The main React component for the UI

## Usage Examples

### Example 1: Keyboard Navigation

1. Open a file in an LWC component (e.g., `myComponent.js`)
2. Press `Alt+O` (or `Option+O` on Mac)
3. Select `myComponent.html` from the QuickPick menu
4. The HTML file opens in the editor

### Example 2: Sidebar Navigation

1. Open any file in your Salesforce project
2. The sidebar will show component files if the current file is part of an LWC or Aura component
3. Click on any file in the sidebar to open it
4. The sidebar will automatically update to highlight the currently open file

## Troubleshooting

- **Issue**: No files appear in the QuickPick menu
  **Solution**: Make sure your file is part of a valid LWC or Aura component structure

- **Issue**: Sidebar does not show any component files
  **Solution**: Verify that your file is in a valid component directory (e.g., lwc/componentName/ or aura/componentName/)

## Related Features

- [Last Modified Details](./last-modified-details.md): Shows who last modified each component file
- [Salesforce Connection Management](./connection-management.md): Manages connection to your Salesforce org

---

[← Back to Documentation Home](../index.md) 