import * as vscode from "vscode";
import * as path from "node:path";
import { editablePresetNames, readPresets, readExtends, resolvePresets, PresetMap } from "./presets";
import { applyPresetNow, getActive } from "./apply";
import { readRcSnapshot, writeRcFile } from "./rcfile";
import { folderQueue, localFolder, configurationTarget } from "./workspace";
import { loadState } from "./state";
export async function togglePath(ctx:vscode.ExtensionContext,uri:vscode.Uri):Promise<void>{
 if(uri.scheme!=="file"||uri.authority)throw new Error("Focus Mode supports local file folders only.");
 const folder=localFolder(vscode.workspace.getWorkspaceFolder(uri));
 const glob=path.relative(folder.uri.fsPath,uri.fsPath).replaceAll("\\","/");
 if(!glob||glob.startsWith("../")||path.isAbsolute(glob))throw new Error("Choose a file inside this workspace folder.");
 const initial=await loadState(folder);const raw=readPresets(initial.rc,folder);const editable=editablePresetNames(raw);
 const picked=await vscode.window.showQuickPick(editable.map(name=>({name,label:name,picked:initial.presets[name]?.[glob]===true})),{title:"Focus Mode: Toggle in presets",placeHolder:`Which presets should hide ${glob}?`,canPickMany:true});
 if(!picked)return;
 const selected=new Set(picked.map(item=>item.name));const edits=editable.filter(name=>selected.has(name)!==(initial.presets[name]?.[glob]===true));
 if(!edits.length)return;
 await folderQueue(folder,async()=>{
  const latest=await loadState(folder);
  if(latest.snapshot.kind!==initial.snapshot.kind)throw new Error("The preset source changed while the choice was open. Review it and try again.");
  const currentRaw=readPresets(latest.rc,folder);
  if(edits.some(name=>!Object.hasOwn(currentRaw,name)))throw new Error("A selected preset was removed. Review the latest presets.");
  const cfg=vscode.workspace.getConfiguration("focusMode",folder.uri);const info=cfg.inspect<PresetMap>("presets");const layer=configurationTarget();
  const target:PresetMap={...(latest.rc?.presets??(layer===vscode.ConfigurationTarget.WorkspaceFolder?info?.workspaceFolderValue:info?.workspaceValue)??{})};
  const ext=readExtends(latest.rc,folder);const resolved=resolvePresets(currentRaw,ext);
  for(const name of edits){const wanted=selected.has(name);if((resolved[name]?.[glob]===true)!==wanted)Object.defineProperty(target,name,{value:{...(target[name]??{}),[glob]:wanted},enumerable:true,configurable:true,writable:true});}
  if(latest.snapshot.kind==="valid")await writeRcFile({...latest.snapshot.raw,presets:target},folder,latest.snapshot);
  else await cfg.update("presets",target,layer);
  const state=await loadState(folder);const active=getActive(ctx,folder);
  if(active)await applyPresetNow(ctx,Object.hasOwn(state.presets,active)?active:state.defaultName,state.presets,folder,true);
 });
}
