import * as vscode from "vscode";
import { applyPresetNow, clearStateNow, getActive, getFolderState, BASELINE_KEY, MANAGED_KEY, refreshPreset } from "./apply";
import { togglePath } from "./toggle";
import { loadState } from "./state";
import { RC_FILENAME, readRcSnapshot, sameRc, writeRcFile, deleteRcFile, RcFile } from "./rcfile";
import { chooseFolder, shownFolder, localFolder, folderQueue, configurationTarget } from "./workspace";
let statusBar:vscode.StatusBarItem;
export async function activate(ctx:vscode.ExtensionContext):Promise<void>{
 statusBar=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,100);statusBar.command="focusMode.cycle";ctx.subscriptions.push(statusBar);
 const report=(error:unknown)=>vscode.window.showErrorMessage(`Focus Mode: ${error instanceof Error?error.message:"The change could not be saved."}`);
 const refresh=async()=>{
  const folder=shownFolder();if(!folder){statusBar.text="$(eye) Focus Mode";statusBar.tooltip="Choose a local workspace folder to change its presets.";statusBar.show();return;}
  try{localFolder(folder);const state=await loadState(folder,true);const active=getActive(ctx,folder)??state.defaultName;statusBar.text=`$(${state.invalid?"warning":"eye"}) ${active}`;statusBar.tooltip=`${folder.name}: ${state.invalid?"Fix the preset file. Last applied settings were kept.":state.order.join(" → ")}`;statusBar.show();}catch(error){statusBar.text="$(warning) Focus Mode";statusBar.tooltip=error instanceof Error?error.message:"Presets are unavailable.";statusBar.show();}
 };
 const command=(id:string,run:(folder:vscode.WorkspaceFolder)=>Promise<void>)=>vscode.commands.registerCommand(id,async()=>{try{const folder=await chooseFolder();await run(folder);await refresh();}catch(error){await report(error);}});
 const reset=async(folder:vscode.WorkspaceFolder,hard:boolean)=>{
  const snapshot=await readRcSnapshot(folder);if(snapshot.kind==="invalid")throw new Error(snapshot.reason);
  const answer=await vscode.window.showWarningMessage(hard?`Remove all exclude settings owned by ${folder.name}, its preset overrides and its ${RC_FILENAME}?`:`Reset presets for ${folder.name}? Unrelated exclude settings will be kept.`,{modal:true},hard?"Hard Reset":"Reset");
  if(answer!==(hard?"Hard Reset":"Reset"))return;
  await folderQueue(folder,async()=>{
   if(!sameRc(snapshot,await readRcSnapshot(folder)))throw new Error("The preset file changed while the confirmation was open. Review it and try again.");
   const cfg=vscode.workspace.getConfiguration("focusMode",folder.uri);for(const key of ["presets","order","default","extends"])await cfg.update(key,undefined,configurationTarget());
   await deleteRcFile(folder,snapshot);await clearStateNow(ctx,folder,hard);const state=await loadState(folder);await applyPresetNow(ctx,state.defaultName,state.presets,folder);
  });
 };
 ctx.subscriptions.push(
  command("focusMode.cycle",folder=>folderQueue(folder,async()=>{const state=await loadState(folder);if(!state.order.length)throw new Error("No presets are configured.");const active=getActive(ctx,folder)??state.defaultName;const next=state.order[(state.order.indexOf(active)+1)%state.order.length]!;await applyPresetNow(ctx,next,state.presets,folder);})),
  command("focusMode.switch",async folder=>{const state=await loadState(folder);const active=getActive(ctx,folder);const pick=await vscode.window.showQuickPick(state.order.map(name=>({label:name,description:name===active?"Active":undefined})),{placeHolder:`Select a preset for ${folder.name}`});if(pick)await folderQueue(folder,async()=>{const latest=await loadState(folder);await applyPresetNow(ctx,pick.label,latest.presets,folder);});}),
  command("focusMode.editPresets",async folder=>{const snapshot=await readRcSnapshot(folder);if(snapshot.kind!=="missing")await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri,RC_FILENAME));else await vscode.commands.executeCommand("workbench.action.openFolderSettings",{revealSetting:{key:"focusMode.presets"}});}),
  command("focusMode.resetPresets",folder=>reset(folder,false)),
  command("focusMode.hardReset",folder=>reset(folder,true)),
  command("focusMode.initRcFile",async folder=>{
   const snapshot=await readRcSnapshot(folder);if(snapshot.kind==="invalid")throw new Error(snapshot.reason);
   if(snapshot.kind==="valid"&&(await vscode.window.showWarningMessage(`Replace ${folder.name}/${RC_FILENAME} with defaults?`,{modal:true},"Overwrite"))!=="Overwrite")return;
   await folderQueue(folder,async()=>{if(!sameRc(snapshot,await readRcSnapshot(folder)))throw new Error("The preset file changed. Review it and try again.");const cfg=vscode.workspace.getConfiguration("focusMode",folder.uri);const rc:RcFile={presets:cfg.inspect<Record<string,Record<string,boolean>>>("presets")?.defaultValue,order:cfg.inspect<string[]>("order")?.defaultValue,default:cfg.inspect<string>("default")?.defaultValue,extends:cfg.inspect<Record<string,string>>("extends")?.defaultValue};await writeRcFile(rc,folder,snapshot);});
   await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri,RC_FILENAME));
  }),
  command("focusMode.showState",async folder=>{const state=await loadState(folder,true);const channel=vscode.window.createOutputChannel("Focus Mode");ctx.subscriptions.push(channel);channel.appendLine(JSON.stringify({folder:folder.name,rcValid:!state.invalid,active:getActive(ctx,folder),presets:Object.keys(state.presets),state:getFolderState(ctx,folder)},null,2));channel.show(true);}),
  command("focusMode.openSettingsJson",async folder=>{await vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri,".vscode","settings.json"));}),
  vscode.commands.registerCommand("focusMode.togglePath",async(uri?:vscode.Uri)=>{try{if(!uri)throw new Error("Right-click a file in the Explorer to change its visibility.");await togglePath(ctx,uri);await refresh();}catch(error){await report(error);}}),
  vscode.window.onDidChangeActiveTextEditor(()=>{void refresh();}),
  vscode.workspace.onDidChangeConfiguration(event=>{for(const folder of vscode.workspace.workspaceFolders??[]){if(["presets","order","default","extends"].some(key=>event.affectsConfiguration(`focusMode.${key}`,folder.uri)))void refreshPreset(ctx,folder).then(refresh).catch(report);}}),
 );
 const watchers=new Map<string,vscode.FileSystemWatcher>();
 const setupFolder=async(folder:vscode.WorkspaceFolder)=>{
  try{localFolder(folder);const key=folder.uri.toString();if(!watchers.has(key)){const watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder,RC_FILENAME));const changed=()=>{void refreshPreset(ctx,folder).then(refresh).catch(report);};watcher.onDidChange(changed);watcher.onDidCreate(changed);watcher.onDidDelete(changed);watchers.set(key,watcher);ctx.subscriptions.push(watcher);}await refreshPreset(ctx,folder);}catch(error){await report(error);}
 };
 ctx.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(event=>{for(const folder of event.removed){watchers.get(folder.uri.toString())?.dispose();watchers.delete(folder.uri.toString());}for(const folder of event.added)void setupFolder(folder);void refresh();}));
 if(ctx.workspaceState.get(BASELINE_KEY)!==undefined||ctx.workspaceState.get(MANAGED_KEY)!==undefined)
  await vscode.window.showInformationMessage("Existing shared exclude settings were kept because the old version did not record their last written values. Review workspace excludes if ALL still hides files.");
 for(const folder of vscode.workspace.workspaceFolders??[])await setupFolder(folder);
 await refresh();
}
export function deactivate():void{}
