import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { PresetMap } from "./presets";

export const RC_FILENAME = ".focusmoderc.json";

export interface RcFile {
  presets?: PresetMap;
  order?: string[];
  default?: string;
  extends?: Record<string, string>;
}

export function rcFilePath(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return path.join(folder.uri.fsPath, RC_FILENAME);
}

export async function hasRcFile(): Promise<boolean> {
  const p = rcFilePath();
  if (!p) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readRcFile(): Promise<RcFile | undefined> {
  const p = rcFilePath();
  if (!p) return undefined;
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    // Accept either {presets, order, default} or a bare preset map.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (
        "presets" in parsed ||
        "order" in parsed ||
        "default" in parsed ||
        "extends" in parsed
      ) {
        return parsed as RcFile;
      }
      return { presets: parsed as PresetMap };
    }
    return undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    vscode.window.showErrorMessage(
      `Focus Mode: failed to parse ${RC_FILENAME} — ${(err as Error).message}`,
    );
    return undefined;
  }
}

export async function writeRcFile(rc: RcFile): Promise<void> {
  const p = rcFilePath();
  if (!p) throw new Error("No workspace folder open.");
  const body = JSON.stringify(rc, null, 2) + "\n";
  await fs.writeFile(p, body, "utf8");
}

export async function deleteRcFile(): Promise<boolean> {
  const p = rcFilePath();
  if (!p) return false;
  try {
    await fs.unlink(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
