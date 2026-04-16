import * as vscode from "vscode";
import { readPresets, readOrder, readDefault, readExtends, resolvePresets, PresetMap } from "./presets";
import {
  applyPreset,
  getActive,
  ensureBaseline,
  clearState,
  hardClearState,
  BASELINE_KEY,
  ACTIVE_KEY,
  MANAGED_KEY,
} from "./apply";
import { togglePath } from "./toggle";
import { RC_FILENAME, RcFile, deleteRcFile, hasRcFile, readRcFile, writeRcFile } from "./rcfile";

let statusBar: vscode.StatusBarItem;

interface State {
  rc: RcFile | undefined;
  presets: PresetMap;
  order: string[];
  defaultName: string;
}

async function loadState(): Promise<State> {
  const rc = await readRcFile();
  const raw = readPresets(rc);
  const ext = readExtends(rc);
  const presets = resolvePresets(raw, ext);
  const order = readOrder(presets, rc);
  const defaultName = readDefault(presets, order, rc);
  return { rc, presets, order, defaultName };
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const hasWorkspace = () => (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  if (hasWorkspace()) {
    await ensureBaseline(ctx);
  }

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "focusMode.cycle";
  ctx.subscriptions.push(statusBar);

  const refresh = async () => {
    const { order, defaultName } = await loadState();
    const active = getActive(ctx) ?? defaultName;
    statusBar.text = `$(eye) ${active}`;
    statusBar.tooltip = buildTooltip(order, active);
    statusBar.show();
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand("focusMode.cycle", async () => {
      if (!hasWorkspace()) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      const { presets, order, defaultName } = await loadState();
      if (order.length === 0) {
        vscode.window.showWarningMessage("Focus Mode: no presets configured.");
        return;
      }
      const active = getActive(ctx) ?? defaultName;
      const idx = order.indexOf(active);
      const next = order[(idx + 1) % order.length];
      await applyPreset(ctx, next, presets);
      await refresh();
    }),
    vscode.commands.registerCommand("focusMode.switch", async () => {
      if (!hasWorkspace()) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      const { presets, order } = await loadState();
      const active = getActive(ctx);
      const pick = await vscode.window.showQuickPick(
        order.map((name) => ({
          label: name,
          description: name === active ? "(active)" : undefined,
        })),
        { placeHolder: "Select a focus preset" },
      );
      if (!pick) return;
      await applyPreset(ctx, pick.label, presets);
      await refresh();
    }),
    vscode.commands.registerCommand("focusMode.editPresets", async () => {
      const rc = await readRcFile();
      if (rc !== undefined) {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
          const uri = vscode.Uri.joinPath(folder.uri, RC_FILENAME);
          await vscode.window.showTextDocument(uri);
          return;
        }
      }
      await vscode.commands.executeCommand(
        "workbench.action.openSettingsJson",
        { revealSetting: { key: "focusMode.presets" } },
      );
    }),
    vscode.commands.registerCommand("focusMode.resetPresets", async () => {
      if (!hasWorkspace()) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      const pick = await vscode.window.showWarningMessage(
        `Reset Focus Mode presets? This removes workspace customizations (including ${RC_FILENAME} if present) and restores files.exclude to its pre-extension state.`,
        { modal: true },
        "Reset",
      );
      if (pick !== "Reset") return;
      const cfg = vscode.workspace.getConfiguration("focusMode");
      await cfg.update("presets", undefined, vscode.ConfigurationTarget.Workspace);
      await cfg.update("order", undefined, vscode.ConfigurationTarget.Workspace);
      await cfg.update("default", undefined, vscode.ConfigurationTarget.Workspace);
      await cfg.update("extends", undefined, vscode.ConfigurationTarget.Workspace);
      await deleteRcFile();
      await clearState(ctx);
      await ensureBaseline(ctx);
      const { presets, defaultName } = await loadState();
      if (presets[defaultName]) await applyPreset(ctx, defaultName, presets);
      await refresh();
      vscode.window.showInformationMessage("Focus Mode: presets reset to defaults.");
    }),
    vscode.commands.registerCommand("focusMode.initRcFile", async () => {
      if (!hasWorkspace()) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      if (await hasRcFile()) {
        const choice = await vscode.window.showWarningMessage(
          `${RC_FILENAME} already exists. Overwrite with extension defaults?`,
          { modal: true },
          "Overwrite",
        );
        if (choice !== "Overwrite") return;
      }
      const cfg = vscode.workspace.getConfiguration("focusMode");
      const defaults: RcFile = {
        presets: cfg.inspect<Record<string, Record<string, boolean>>>("presets")?.defaultValue,
        order: cfg.inspect<string[]>("order")?.defaultValue,
        default: cfg.inspect<string>("default")?.defaultValue,
        extends: cfg.inspect<Record<string, string>>("extends")?.defaultValue,
      };
      await writeRcFile(defaults);
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (folder) {
        const uri = vscode.Uri.joinPath(folder.uri, RC_FILENAME);
        await vscode.window.showTextDocument(uri);
      }
      vscode.window.showInformationMessage(`Focus Mode: created ${RC_FILENAME}.`);
    }),
    vscode.commands.registerCommand("focusMode.hardReset", async () => {
      if (!hasWorkspace()) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      const pick = await vscode.window.showWarningMessage(
        "Focus Mode Hard Reset: this DELETES all of `files.exclude` at workspace scope, removes `focusMode.*` settings, removes the rc file, and clears internal state. Use this if the Explorer is stuck hiding everything.",
        { modal: true },
        "Hard Reset",
      );
      if (pick !== "Hard Reset") return;
      const cfg = vscode.workspace.getConfiguration("focusMode");
      await cfg.update("presets", undefined, vscode.ConfigurationTarget.Workspace);
      await cfg.update("order", undefined, vscode.ConfigurationTarget.Workspace);
      await cfg.update("default", undefined, vscode.ConfigurationTarget.Workspace);
      await cfg.update("extends", undefined, vscode.ConfigurationTarget.Workspace);
      await deleteRcFile();
      await hardClearState(ctx);
      await ensureBaseline(ctx);
      const { presets, defaultName } = await loadState();
      if (presets[defaultName]) await applyPreset(ctx, defaultName, presets);
      await refresh();
      vscode.window.showInformationMessage("Focus Mode: hard reset done.");
    }),
    vscode.commands.registerCommand("focusMode.showState", async () => {
      const { rc, presets, order, defaultName } = await loadState();
      const active = getActive(ctx);
      const baseline = ctx.workspaceState.get<Record<string, boolean>>(BASELINE_KEY);
      const managed = ctx.workspaceState.get<string[]>(MANAGED_KEY);
      const filesCfg = vscode.workspace.getConfiguration("files");
      const excludeInsp = filesCfg.inspect<Record<string, boolean>>("exclude");
      const info = {
        workspaceFolders: vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath),
        rcFilePresent: rc !== undefined,
        rcFileContents: rc,
        active,
        defaultName,
        order,
        presetNames: Object.keys(presets),
        presetSizes: Object.fromEntries(
          Object.entries(presets).map(([k, v]) => [k, Object.keys(v).length]),
        ),
        workspaceState: {
          [BASELINE_KEY]: baseline ? Object.keys(baseline).length : null,
          [ACTIVE_KEY]: active ?? null,
          [MANAGED_KEY]: managed ? managed.length : null,
        },
        filesExclude: {
          defaultKeys: Object.keys(excludeInsp?.defaultValue ?? {}).length,
          globalKeys: Object.keys(excludeInsp?.globalValue ?? {}).length,
          workspaceKeys: Object.keys(excludeInsp?.workspaceValue ?? {}).length,
          workspaceFolderKeys: Object.keys(excludeInsp?.workspaceFolderValue ?? {}).length,
        },
      };
      const channel = vscode.window.createOutputChannel("Focus Mode");
      channel.appendLine("=== focusMode.showState ===");
      channel.appendLine(JSON.stringify(info, null, 2));
      channel.show(true);
    }),
    vscode.commands.registerCommand("focusMode.openSettingsJson", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      const uri = vscode.Uri.joinPath(folder.uri, ".vscode", "settings.json");
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
      } catch {
        await vscode.commands.executeCommand(
          "workbench.action.openWorkspaceSettingsFile",
        );
      }
    }),
    vscode.commands.registerCommand("focusMode.togglePath", async (uri?: vscode.Uri) => {
      if (!hasWorkspace()) {
        vscode.window.showWarningMessage("Focus Mode: open a folder first.");
        return;
      }
      if (!uri) {
        vscode.window.showWarningMessage(
          "Focus Mode: run this command by right-clicking a file in the Explorer.",
        );
        return;
      }
      await togglePath(ctx, uri);
      await refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("focusMode.presets") ||
        e.affectsConfiguration("focusMode.order") ||
        e.affectsConfiguration("focusMode.default") ||
        e.affectsConfiguration("focusMode.extends")
      ) {
        void refresh();
      }
    }),
  );

  if (hasWorkspace()) {
    const watcher = vscode.workspace.createFileSystemWatcher(`**/${RC_FILENAME}`);
    const onRcChange = async () => {
      const { presets } = await loadState();
      const active = getActive(ctx);
      if (active && presets[active]) {
        await applyPreset(ctx, active, presets);
      }
      await refresh();
    };
    watcher.onDidChange(onRcChange);
    watcher.onDidCreate(onRcChange);
    watcher.onDidDelete(onRcChange);
    ctx.subscriptions.push(watcher);
  }

  if (hasWorkspace()) {
    const { presets, defaultName } = await loadState();
    if (!getActive(ctx)) {
      if (presets[defaultName]) await applyPreset(ctx, defaultName, presets);
    }
  }
  await refresh();

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
  );
}

function buildTooltip(order: string[], active: string): string {
  const lines = order.map((n) => (n === active ? `● ${n}` : `  ${n}`));
  return `Focus Mode — click to cycle\n${lines.join("\n")}`;
}

export function deactivate(): void {}
