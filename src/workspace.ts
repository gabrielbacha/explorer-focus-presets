import * as vscode from "vscode";

const queues = new Map<string, Promise<unknown>>();
let lastFolder: vscode.WorkspaceFolder | undefined;
export function localFolder(folder?: vscode.WorkspaceFolder): vscode.WorkspaceFolder {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const selected = folder ?? (folders.length === 1 ? folders[0] : undefined);
  if (!selected) throw new Error("Choose a workspace folder first.");
  if (selected.uri.scheme !== "file" || selected.uri.authority)
    throw new Error("Focus Mode supports local file folders. Remote URI folders are not supported yet.");
  return selected;
}
export async function chooseFolder(uri?: vscode.Uri): Promise<vscode.WorkspaceFolder> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const selected = uri ? vscode.workspace.getWorkspaceFolder(uri)
    : vscode.window.activeTextEditor ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
    : folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
  lastFolder = localFolder(selected);
  return lastFolder;
}
export function shownFolder(): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return (vscode.window.activeTextEditor && vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri))
    || (lastFolder && folders.find(folder => folder.uri.toString() === lastFolder!.uri.toString()))
    || (folders.length === 1 ? folders[0] : undefined);
}
export function configurationTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFile || (vscode.workspace.workspaceFolders?.length ?? 0) > 1
    ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace;
}
export function folderQueue<T>(folder: vscode.WorkspaceFolder, run: () => Promise<T>): Promise<T> {
  const key = localFolder(folder).uri.toString();
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
