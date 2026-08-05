# Explorer Focus Presets

![Explorer Focus Presets logo](icon.png)

A VS Code extension that toggles named file-visibility presets (for example, `ALL` / `SETUP` / `CORE`) to cut Explorer cognitive overload.

[Install from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=gabrielbacha.explorer-focus-presets) · [Install from Open VSX](https://open-vsx.org/extension/gabrielbacha/explorer-focus-presets) · [Source code](https://github.com/gabrielbacha/explorer-focus-presets)

Click the status bar item `👁 CORE` to cycle to the next preset. Each preset is just a `files.exclude` glob map, so you get the native VS Code hiding behaviour.

## Usage

- **Status bar**: click `$(eye) <preset>` to cycle.
- **Right-click a file/folder** → `Focus Mode: Toggle in presets…` — single quickpick, tick the presets that should hide the path. Writes the workspace-relative path as-is; edit globs in the rc file / settings if you want `**/…` patterns.
- **Command palette**:
  - `Focus Mode: Cycle Preset`
  - `Focus Mode: Switch Preset...` (quick pick)
  - `Focus Mode: Edit Presets` (jumps into settings.json)
  - `Focus Mode: Create .focusmoderc.json` (scaffolds the rc file from extension defaults)
  - `Focus Mode: Reset Presets to Defaults` (wipes workspace overrides + restores `files.exclude`)

Bind any of these to keys via `keybindings.json`.

## Mental model

Only two presets are meant to be edited: **SETUP** (everyday — hide generated dirs, lockfiles, etc.) and **CORE** (deep focus — hide config files too). **ALL** is built in — it always shows everything and can't be edited.

`CORE` extends `SETUP` by default, so anything hidden by SETUP is also hidden by CORE — you only list the *extra* globs in CORE. Change inheritance via `focusMode.extends` (or the `extends` key in the rc file). Set to `{}` or `{ "CORE": "" }` to make presets fully independent.

## Configuration

Two ways to configure, pick whichever you prefer:

### Option 1 — `.focusmoderc.json` at the workspace root (recommended)

A plain JSON file, checked into git alongside your code. When present, it's the authoritative source — **Edit Presets**, **Toggle**, and **Reset** all operate on this file.

```jsonc
// .focusmoderc.json
{
  "presets": {
    "SETUP": {
      "**/node_modules": true,
      "**/.turbo": true,
      "**/.next": true
    },
    "CORE": {
      "**/node_modules": true,
      "**/.turbo": true,
      "turbo.json": true,
      "package.json": true,
      "eslint.config.*": true
    }
  },
  "order": ["ALL", "SETUP", "CORE"],
  "default": "ALL"
}
```

A bare preset map (no `presets`/`order`/`default` wrapper) is also accepted — the file is treated as the preset map directly.

### Option 2 — VS Code settings

```jsonc
// .vscode/settings.json or user settings
{
  "focusMode.presets": {
    "SETUP": { "**/node_modules": true },
    "CORE":  { "**/node_modules": true, "turbo.json": true }
  },
  "focusMode.order": ["ALL", "SETUP", "CORE"],
  "focusMode.default": "ALL"
}
```

### Precedence

`.focusmoderc.json` > workspace settings > global user settings > contributed defaults. Per-key merge, closest wins.

Workspace-level presets are merged **on top of** global user-settings presets (workspace wins per-key), so you can keep a shared global preset and still override per-project.

Your pre-existing workspace `files.exclude` entries are preserved — the extension snapshots them on first activation and re-applies them under every preset.

## Develop

```bash
npm install
npm run compile
# then F5 in VS Code → Extension Development Host
```

Maintainers: see [PUBLISH.md](PUBLISH.md) for packaging and release instructions.
