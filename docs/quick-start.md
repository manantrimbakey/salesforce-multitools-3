# Salesforce Multitools - Quick Start Guide

This guide will help you get up and running with the Salesforce Multitools extension quickly.

## Installation

1. Open VS Code
2. Go to the Extensions view by clicking the Extensions icon in the Activity Bar or pressing `Ctrl+Shift+X`
3. Search for "Salesforce Multitools"
4. Click the Install button
5. Reload VS Code when prompted

## Initial Setup

The extension automatically activates when it detects a Salesforce project. It looks for:

- A `.sfdx/sfdx-config.json` file in your workspace

If you're not using SFDX, you can still activate the extension, but some features may require additional configuration.

## Using the Component File Switcher

### Keyboard Navigation

1. Open any file in a Lightning Web Component or Aura Component (e.g., `lwc/myComponent/myComponent.js`)
2. Press `Alt+O` (or `Option+O` on Mac)
3. Select the file you want to open from the QuickPick menu
4. The selected file will open in the editor

### Sidebar Navigation

1. Click on the Salesforce Multitools icon in the Activity Bar
2. This opens the Explorer view in the Side Bar
3. When you have a Lightning component file open, you'll see the Component Files section
4. Files are grouped by type (JavaScript, HTML, CSS, etc.)
5. Click on any file to open it

## Component File Switcher Features

- Files are organized by type
- Main component files appear at the top
- Current file is highlighted
- Unsaved files show an indicator
- Quick keyboard access with Alt+O / Option+O

## Example Workflows

### Workflow 1: Switching Between JS and HTML in an LWC

1. Open an LWC JavaScript file (e.g., `myComponent.js`)
2. Press `Alt+O` (or `Option+O` on Mac)
3. Select the HTML file (`myComponent.html`)
4. Make your HTML changes
5. Press `Alt+O` again
6. Select the JavaScript file to go back

### Workflow 2: Exploring Component Files

1. Open any file in your Salesforce project
2. Look at the Salesforce Multitools Explorer in the sidebar
3. If your file is part of an LWC or Aura component, you'll see all related files
4. Click on different files to explore them
5. Notice how the currently open file is highlighted

## Tips and Tricks

1. **Keyboard Efficiency**: Use Alt+O / Option+O to quickly switch between component files
2. **Sidebar Navigation**: Use the sidebar for visual navigation
3. **Unsaved Files**: Look for the indicator dot to spot unsaved files
4. **Main Component File**: The main component file is shown in bold

## Next Steps

- Learn about the [Last Modified Details](./features/last-modified-details.md) feature
- Explore the [Salesforce Connection Management](./features/connection-management.md)
- Check the [full documentation](./index.md) for more features and details

## Getting Help

- Check our [Troubleshooting Guide](./troubleshooting.md)
- Review the [GitHub Issues](https://github.com/yourusername/salesforce-multitools-3/issues) for known problems
- Submit a [new issue](https://github.com/yourusername/salesforce-multitools-3/issues/new) if you encounter problems 