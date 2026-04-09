# Semantica Plugins (Community Guide)

Semantica ships a shared plugin bundle under `plugins/` with skills, agents, and hooks for knowledge graphs, context graphs, decision intelligence, reasoning, explainability, provenance, ontology, and export workflows.

This README is for community users who want to install or reuse the plugin package across Claude, Cursor, and Codex.

## Supported Platforms

- Claude Code
- Cursor
- Codex

## Plugin Contents

- `skills/`: 17 domain skills (`causal`, `decision`, `explain`, `reason`, `temporal`, etc.)
- `agents/`: specialized agents (`decision-advisor`, `explainability`, `kg-assistant`)
- `hooks/hooks.json`: plugin hook configuration
- `.claude-plugin/plugin.json`: Claude manifest
- `.cursor-plugin/plugin.json`: Cursor manifest
- `.codex-plugin/plugin.json`: Codex manifest
- `*/marketplace.json`: local marketplace definitions

## Use In Claude Code

From the repository root:

```bash
claude --plugin-dir ./plugins
```

Or add a marketplace hosted in a git repo:

```bash
/plugin marketplace add <owner>/semantica
```

Then install the plugin from that marketplace:

```bash
/plugin install semantica@<marketplace-name>
```

## Use In Codex

1. Ensure your repo marketplace exists at `.agents/plugins/marketplace.json`.
2. Point the plugin entry `source.path` to `./plugins` (or your chosen plugin directory).
3. Restart Codex and install from the marketplace UI.

Codex manifest used by this bundle:

- `.codex-plugin/plugin.json`

## Use In Cursor

Cursor reads plugin metadata from:

- `.cursor-plugin/plugin.json`
- `.cursor-plugin/marketplace.json`

If you maintain a team/community plugin repo, publish this `plugins/` directory and refresh/reinstall in Cursor Marketplace to pick up updates.

## Community Notes

- Keep plugin name/version/keywords updated in each manifest before publishing.
- Keep skill frontmatter consistent (`name` + `description`) for reliable discovery.
- For open-source sharing, include this folder as-is so skills, agents, and hooks remain bundled.
