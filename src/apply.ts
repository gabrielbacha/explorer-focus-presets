import * as vscode from "vscode";
import { GlobMap, PresetMap } from "./presets";

export const BASELINE_KEY = "focusMode.baseExclude";
export const ACTIVE_KEY = "focusMode.activePreset";
export const MANAGED_KEY = "focusMode.managedKeys";

export async function ensureBaseline(ctx: vscode.ExtensionContext): Promise<GlobMap> {
  const existing = ctx.workspaceState.get<GlobMap>(BASELINE_KEY);
  if (existing) return existing;
  const filesCfg = vscode.workspace.getConfiguration("files");
  const current = filesCfg.inspect<GlobMap>("exclude");
  // Capture workspace-level exclude only; ignore defaults + extension-managed keys.
  const baseline: GlobMap = { ...(current?.workspaceValue ?? {}) };
  await ctx.workspaceState.update(BASELINE_KEY, baseline);
  return baseline;
}

export function getActive(ctx: vscode.ExtensionContext): string | undefined {
  return ctx.workspaceState.get<string>(ACTIVE_KEY);
}

export async function applyPreset(
  ctx: vscode.ExtensionContext,
  name: string,
  presets: PresetMap,
): Promise<void> {
  const preset = presets[name];
  if (!preset) {
    vscode.window.showErrorMessage(`Focus Mode: preset "${name}" not found.`);
    return;
  }
  const baseline = await ensureBaseline(ctx);
  const filesCfg = vscode.workspace.getConfiguration("files");
  const currentWorkspace = filesCfg.inspect<GlobMap>("exclude")?.workspaceValue ?? {};
  const previouslyManaged = ctx.workspaceState.get<string[]>(MANAGED_KEY, []);

  const next: GlobMap = { ...currentWorkspace };
  // Strip previously managed keys that the user hasn't manually kept in baseline.
  for (const key of previouslyManaged) {
    if (!(key in baseline)) delete next[key];
  }
  // Apply baseline then preset on top.
  for (const [k, v] of Object.entries(baseline)) next[k] = v;
  for (const [k, v] of Object.entries(preset)) next[k] = v;

  await filesCfg.update("exclude", next, vscode.ConfigurationTarget.Workspace);
  await ctx.workspaceState.update(ACTIVE_KEY, name);
  await ctx.workspaceState.update(MANAGED_KEY, Object.keys(preset));
}

export async function clearState(ctx: vscode.ExtensionContext): Promise<void> {
  const baseline = ctx.workspaceState.get<GlobMap>(BASELINE_KEY) ?? {};
  const filesCfg = vscode.workspace.getConfiguration("files");
  const wsValue = Object.keys(baseline).length > 0 ? baseline : undefined;
  await filesCfg.update("exclude", wsValue, vscode.ConfigurationTarget.Workspace);
  await ctx.workspaceState.update(BASELINE_KEY, undefined);
  await ctx.workspaceState.update(ACTIVE_KEY, undefined);
  await ctx.workspaceState.update(MANAGED_KEY, undefined);
}

export async function hardClearState(ctx: vscode.ExtensionContext): Promise<void> {
  const filesCfg = vscode.workspace.getConfiguration("files");
  await filesCfg.update("exclude", undefined, vscode.ConfigurationTarget.Workspace);
  await ctx.workspaceState.update(BASELINE_KEY, undefined);
  await ctx.workspaceState.update(ACTIVE_KEY, undefined);
  await ctx.workspaceState.update(MANAGED_KEY, undefined);
}
