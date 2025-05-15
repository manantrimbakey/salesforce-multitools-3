# Salesforce Multitools Extension

A VS Code extension that provides a suite of tools for Salesforce development.

## Features

### LWC/Aura Component File Switcher

Quickly switch between files in a Lightning component (LWC or Aura) using:

- **Keyboard Shortcut**: `Alt+O` (or `Option+O` on Mac)
- **Sidebar UI**: View and click on component files in the sidebar

#### How it works

When you're working with a Lightning Web Component or Aura Component:

1. Press `Alt+O` (or `Option+O` on Mac) to see a quick picker with all files in the component
2. Files are sorted by type priority:
   - For LWC: JS file with the same name as the component has highest priority, followed by HTML and CSS
   - For Aura: Controller.js has highest priority, followed by the main component file and CSS

#### Visual Indicators

The sidebar component shows:
- Component name and type (LWC or Aura)
- Files grouped by type 
- Unsaved files have an indicator
- Currently open file is highlighted

## Other Features

- Last Modified Details - View when components were last modified and by whom
- Salesforce Connection Management

## Requirements

- VS Code 1.90.0 or later
- Salesforce CLI

## Installation

Install through the VS Code Marketplace or download the VSIX file from the releases section.

## Extension Development

### Building the Extension

1. Clone the repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to start debugging

### Project Structure

- `/src` - Extension source code
  - `/features` - Feature modules
    - `/componentFileSwitcher` - LWC/Aura file switcher
    - `/lastModifiedDetails` - Last modified tracking
    - `/sidePanel` - Sidebar webview
  - `/utils` - Utility functions
- `/client` - React components for webviews
  - `/src/components` - UI components
