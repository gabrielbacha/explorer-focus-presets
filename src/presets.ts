import * as vscode from "vscode";
import type { RcFile } from "./rcfile";

export type GlobMap = Record<string, boolean>;
export type PresetMap = Record<string, GlobMap>;
export type ExtendsMap = Record<string, string>;

export const ALL_PRESET = "ALL";

export function readPresets(rc?: RcFile, folder?: vscode.WorkspaceFolder): PresetMap {
  const cfg = vscode.workspace.getConfiguration("focusMode", folder?.uri);
  const inspected = cfg.inspect<PresetMap>("presets");
  const defaultVal = inspected?.defaultValue ?? {};
  const globalVal = inspected?.globalValue ?? {};
  const workspaceVal = inspected?.workspaceValue ?? {};
  const folderVal = inspected?.workspaceFolderValue ?? {};
  const rcVal = rc?.presets ?? {};
  const merged: PresetMap = Object.create(null);
  const names = new Set([
    ...Object.keys(defaultVal),
    ...Object.keys(globalVal),
    ...Object.keys(workspaceVal),
    ...Object.keys(folderVal),
    ...Object.keys(rcVal),
  ]);
  for (const name of names) {
    if (name === ALL_PRESET) continue;
    merged[name] = {
      ...(defaultVal[name] ?? {}),
      ...(globalVal[name] ?? {}),
      ...(workspaceVal[name] ?? {}),
      ...(folderVal[name] ?? {}),
      ...(rcVal[name] ?? {}),
    };
  }
  merged[ALL_PRESET] = {};
  return merged;
}

export function editablePresetNames(presets: PresetMap): string[] {
  return Object.keys(presets).filter((n) => n !== ALL_PRESET);
}

export function readOrder(presets: PresetMap, rc?: RcFile, folder?: vscode.WorkspaceFolder): string[] {
  const cfg = vscode.workspace.getConfiguration("focusMode", folder?.uri);
  const order = rc?.order ?? cfg.get<string[]>("order", []);
  const valid = order.filter((n) => Object.hasOwn(presets,n));
  if (valid.length > 0) return valid;
  return Object.keys(presets);
}

export function readDefault(presets: PresetMap, order: string[], rc?: RcFile, folder?: vscode.WorkspaceFolder): string {
  const cfg = vscode.workspace.getConfiguration("focusMode", folder?.uri);
  const d = rc?.default ?? cfg.get<string>("default", "");
  if (d && Object.hasOwn(presets,d)) return d;
  return order[0] ?? Object.keys(presets)[0] ?? "ALL";
}

export function readExtends(rc?: RcFile, folder?: vscode.WorkspaceFolder): ExtendsMap {
  const cfg = vscode.workspace.getConfiguration("focusMode", folder?.uri);
  const inspected = cfg.inspect<ExtendsMap>("extends");
  return {
    ...(inspected?.defaultValue ?? {}),
    ...(inspected?.globalValue ?? {}),
    ...(inspected?.workspaceValue ?? {}),
    ...(inspected?.workspaceFolderValue ?? {}),
    ...(rc?.extends ?? {}),
  };
}

function resolveOne(
  name: string,
  raw: PresetMap,
  ext: ExtendsMap,
  seen: Set<string>,
): GlobMap {
  if (seen.has(name)) return {};
  seen.add(name);
  const parent = ext[name];
  const parentGlobs =
    parent && parent !== name && Object.hasOwn(raw,parent)
      ? resolveOne(parent, raw, ext, seen)
      : {};
  return { ...parentGlobs, ...(raw[name] ?? {}) };
}

export function resolvePresets(raw: PresetMap, ext: ExtendsMap): PresetMap {
  const out: PresetMap = Object.create(null);
  for (const name of Object.keys(raw)) {
    out[name] = resolveOne(name, raw, ext, new Set());
  }
  out[ALL_PRESET] = {};
  return out;
}
