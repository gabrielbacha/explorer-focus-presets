import * as vscode from "vscode";
import type { GlobMap, PresetMap } from "./presets";
import { configurationTarget, folderQueue, localFolder } from "./workspace";
import { loadState } from "./state";
export const BASELINE_KEY = "focusMode.baseExclude";
export const ACTIVE_KEY = "focusMode.activePreset";
export const MANAGED_KEY = "focusMode.managedKeys";
interface Value { exists: boolean; value?: boolean; }
interface Tracked { before: Value; written: boolean; manual?: boolean; }
export interface FolderState { version: 1; active?: string; layer: vscode.ConfigurationTarget; tracked: Record<string, Tracked>; }
export const folderStateKey = (folder: vscode.WorkspaceFolder): string => `focusMode.folderState.v1:${folder.uri.toString()}`;
const own = (map: GlobMap,key: string): Value => Object.hasOwn(map,key) ? {exists:true,value:map[key]} : {exists:false};
const equal = (a: GlobMap,b: GlobMap): boolean => Object.keys(a).length===Object.keys(b).length && Object.keys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key]);
function layer(config: vscode.WorkspaceConfiguration,target: vscode.ConfigurationTarget): GlobMap {
  const info=config.inspect<GlobMap>("exclude");return {...(target===vscode.ConfigurationTarget.WorkspaceFolder?info?.workspaceFolderValue:info?.workspaceValue) ?? {}};
}
function restore(current: GlobMap, tracked: Record<string,Tracked>): {values: GlobMap; tracked: Record<string,Tracked>} {
 const entries=new Map(Object.entries(current));const next=new Map<string,Tracked>();
 for(const [key,item] of Object.entries(tracked)){
  if(!item.manual&&Object.hasOwn(current,key)&&current[key]===item.written){if(item.before.exists)entries.set(key,item.before.value!);else entries.delete(key);}
  else next.set(key,{...item,manual:true});
 }
 return {values:Object.fromEntries(entries),tracked:Object.fromEntries(next)};
}
export function getFolderState(ctx: vscode.ExtensionContext,folder?: vscode.WorkspaceFolder): FolderState | undefined {
 const value=ctx.workspaceState.get<FolderState>(folderStateKey(localFolder(folder)));
 if(value && (value.version!==1 || (value.active!==undefined && typeof value.active!=="string") || ![vscode.ConfigurationTarget.Workspace,vscode.ConfigurationTarget.WorkspaceFolder].includes(value.layer) || !value.tracked || typeof value.tracked!=="object" || Array.isArray(value.tracked) || Object.values(value.tracked).some(item => !item || typeof item.written!=="boolean" || !item.before || typeof item.before.exists!=="boolean" || (item.before.exists && typeof item.before.value!=="boolean") || (item.manual!==undefined && typeof item.manual!=="boolean"))))throw new Error("Stored Focus Mode state is not supported. Review this folder's settings.");
 return value;
}
export function getActive(ctx: vscode.ExtensionContext,folder?: vscode.WorkspaceFolder): string | undefined {return getFolderState(ctx,folder)?.active;}
/** Caller holds folderQueue, including the read that produced these presets. */
export async function applyPresetNow(ctx: vscode.ExtensionContext,name:string,presets:PresetMap,folder:vscode.WorkspaceFolder,refresh=false):Promise<void>{
 if(!Object.hasOwn(presets,name))throw new Error(`Preset "${name}" is no longer available.`);
 const target=configurationTarget();const cfg=vscode.workspace.getConfiguration("files",folder.uri);
 let previous=getFolderState(ctx,folder);
 if(previous&&previous.layer!==target){const old=layer(cfg,previous.layer);const restored=restore(old,previous.tracked);if(!equal(old,restored.values))await cfg.update("exclude",Object.keys(restored.values).length?restored.values:undefined,previous.layer);previous={...previous,layer:target,tracked:{}};}
 const current=layer(cfg,target);const restored=restore(current,previous?.tracked??{});const values=new Map(Object.entries(restored.values));const tracked=new Map<string,Tracked>(refresh?Object.entries(restored.tracked):[]);
 for(const [key,written] of Object.entries(presets[name]!)){
  if(refresh&&restored.tracked[key]?.manual)continue;
  tracked.set(key,{before:own(restored.values,key),written});values.set(key,written);
 }
 const next=Object.fromEntries(values);const state:FolderState={version:1,active:name,layer:target,tracked:Object.fromEntries(tracked)};
 const changed=!equal(current,next);
 if(changed)await cfg.update("exclude",Object.keys(next).length?next:undefined,target);
 try{await ctx.workspaceState.update(folderStateKey(folder),state);}catch(error){
  if(changed&&equal(layer(cfg,target),next))await cfg.update("exclude",Object.keys(current).length?current:undefined,target);
  throw error;
 }
}
export async function applyPreset(ctx:vscode.ExtensionContext,name:string,_presets?:PresetMap,folder?:vscode.WorkspaceFolder):Promise<void>{
 const selected=localFolder(folder);await folderQueue(selected,async()=>{const state=await loadState(selected);await applyPresetNow(ctx,name,state.presets,selected);});
}
export async function refreshPreset(ctx:vscode.ExtensionContext,folder:vscode.WorkspaceFolder):Promise<void>{
 await folderQueue(folder,async()=>{const state=await loadState(folder);const active=getActive(ctx,folder);await applyPresetNow(ctx,active&&Object.hasOwn(state.presets,active)?active:state.defaultName,state.presets,folder,true);});
}
export async function clearStateNow(ctx:vscode.ExtensionContext,folder:vscode.WorkspaceFolder,hard=false):Promise<void>{
 const state=getFolderState(ctx,folder);const target=state?.layer??configurationTarget();const cfg=vscode.workspace.getConfiguration("files",folder.uri);const current=layer(cfg,target);const next=restore(current,state?.tracked??{}).values;
 if(!equal(current,next))await cfg.update("exclude",Object.keys(next).length?next:undefined,target);
 await ctx.workspaceState.update(folderStateKey(folder),undefined);
}
export async function clearState(ctx:vscode.ExtensionContext,folder?:vscode.WorkspaceFolder):Promise<void>{const selected=localFolder(folder);await folderQueue(selected,()=>clearStateNow(ctx,selected));}
export async function hardClearState(ctx:vscode.ExtensionContext,folder?:vscode.WorkspaceFolder):Promise<void>{const selected=localFolder(folder);await folderQueue(selected,()=>clearStateNow(ctx,selected,true));}
