import * as vscode from "vscode";
import { readRcSnapshot, RcFile, RcSnapshot } from "./rcfile";
import { readPresets, readExtends, resolvePresets, readOrder, readDefault, PresetMap } from "./presets";
export interface State { rc?: RcFile; snapshot: RcSnapshot; presets: PresetMap; order: string[]; defaultName: string; invalid: boolean; }
const lastGood = new Map<string, State>();
export async function loadState(folder: vscode.WorkspaceFolder, showLastGood = false): Promise<State> {
  const snapshot = await readRcSnapshot(folder);
  if (snapshot.kind === "invalid") {
    if (!showLastGood) throw new Error(snapshot.reason);
    return { ...(lastGood.get(folder.uri.toString()) ?? {presets:{},order:[],defaultName:"ALL"}), snapshot, invalid:true };
  }
  const rc = snapshot.kind === "valid" ? snapshot.rc : undefined;
  const presets = resolvePresets(readPresets(rc,folder),readExtends(rc,folder));
  const order = readOrder(presets,rc,folder);const defaultName = readDefault(presets,order,rc,folder);
  const state = {rc,snapshot,presets,order,defaultName,invalid:false};lastGood.set(folder.uri.toString(),state);return state;
}
