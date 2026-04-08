# Semantica Claude Plugin

This folder contains the plugin metadata for the Semantica Claude/Cursor/Codex plugin.

## Installation

- In Claude Code or Cursor, install this plugin from the repository root where `plugins` lives.
- If your workspace root is the `plugins` folder, use:

```bash
/plugin install ./
```

- If this repo is published on GitHub and the plugin root is the `plugins` folder, add it as a marketplace:

```bash
/plugin marketplace add <owner>/semantica
```
```

## Supported platforms

- Claude
- Cursor
- Codex

## What is included

- `skills/`: plugin skill definitions for graph, reasoning, extraction, validation, visualization, and more.
- `hooks/`: plugin hooks for post-edit and pre-tool usage.
- `agents/`: agent definitions for explainability and other workflows.
- `.claude-plugin/plugin.json`: plugin manifest and compatibility metadata.
- `.claude-plugin/marketplace.json`: marketplace registry file.
