import * as vscode from "vscode";
import * as path from "path";
import {
  GlobMap,
  PresetMap,
  editablePresetNames,
  readExtends,
  readPresets,
  resolvePresets,
} from "./presets";
import { applyPreset, getActive } from "./apply";
import { hasRcFile, readRcFile, writeRcFile } from "./rcfile";

export async function togglePath(
  ctx: vscode.ExtensionContext,
  uri: vscode.Uri,
): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    vscode.window.showWarningMessage(
      "Focus Mode: file is not in an open workspace folder.",
    );
    return;
  }
  const relPath = path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
  if (!relPath) {
    vscode.window.showWarningMessage("Focus Mode: cannot toggle the workspace root.");
    return;
  }

  const rc = await readRcFile();
  const raw = readPresets(rc);
  const ext = readExtends(rc);
  const resolved = resolvePresets(raw, ext);
  const editable = editablePresetNames(raw);
  if (editable.length === 0) {
    vscode.window.showWarningMessage("Focus Mode: no editable presets configured.");
    return;
  }

  const glob = relPath;
  const items: (vscode.QuickPickItem & { name: string })[] = editable.map((name) => {
    const resolvedHides = resolved[name]?.[glob] === true;
    const ownRaw = raw[name]?.[glob];
    const inheritedFrom =
      resolvedHides && ownRaw === undefined ? ext[name] : undefined;
    return {
      name,
      label: name,
      description:
        inheritedFrom !== undefined
          ? `inherits from ${inheritedFrom}`
          : resolvedHides
            ? "currently hides"
            : undefined,
      picked: resolvedHides,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Which presets should hide \`${glob}\`?`,
    title: "Focus Mode: Toggle in presets",
    canPickMany: true,
  });
  if (!picked) return;

  const selected = new Set(picked.map((p) => p.name));
  const useRc = await hasRcFile();
  const cfg = vscode.workspace.getConfiguration("focusMode");
  const inspected = cfg.inspect<PresetMap>("presets");
  const target: PresetMap = useRc
    ? { ...(rc?.presets ?? {}) }
    : { ...(inspected?.workspaceValue ?? {}) };
  let changedActive = false;
  const active = getActive(ctx);

  for (const name of editable) {
    const shouldHide = selected.has(name);
    const currentlyHides = resolved[name]?.[glob] === true;
    if (shouldHide === currentlyHides) continue;

    const sub: GlobMap = { ...(target[name] ?? {}) };
    sub[glob] = shouldHide;
    target[name] = sub;
    if (name === active) changedActive = true;
  }

  if (useRc) {
    await writeRcFile({ ...rc, presets: target });
  } else {
    await cfg.update(
      "presets",
      Object.keys(target).length > 0 ? target : undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }

  if (changedActive && active) {
    const freshRc = await readRcFile();
    const freshRaw = readPresets(freshRc);
    const freshExt = readExtends(freshRc);
    await applyPreset(ctx, active, resolvePresets(freshRaw, freshExt));
  }
}
