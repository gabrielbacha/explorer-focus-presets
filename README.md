# Focus Mode

A VSCode extension that toggles named file-visibility presets (e.g. `ALL` / `SETUP` / `CORE`) to cut Explorer cognitive overload.

Click the status bar item `👁 CORE` to cycle to the next preset. Each preset is just a `files.exclude` glob map, so you get the native VSCode hiding behaviour.

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

### Option 2 — VSCode settings

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
# then F5 in VSCode → Extension Development Host
```

Package a `.vsix`:

```bash
npm run package
```

## Publish to Open VSX

> TODO: add a `icon.png` (128×128) and reference it with `"icon": "icon.png"` in `package.json` before publishing for a non-empty listing page.

1. Sign in at https://open-vsx.org with GitHub.
2. User Settings → **Access Tokens** → generate a token with `publish` scope.
3. Claim the `gabrielbacha` namespace (self-serve if the name is free, or request via the Eclipse issue tracker).
4. Store the token locally (already done for this repo via `.env.local` → `OVSX_PAT=…`; the file is gitignored).
5. Publish:
   ```bash
   export $(grep -v '^#' .env.local | xargs)   # load OVSX_PAT into shell
   npm run compile
   npx vsce package
   npx ovsx publish vscode-focus-mode-<version>.vsix -p "$OVSX_PAT"
   ```
6. Listing appears at `https://open-vsx.org/extension/gabrielbacha/vscode-focus-mode` within ~1 minute.

To publish updates: bump `version` in `package.json`, recompile, rerun `vsce package` + `ovsx publish`.
