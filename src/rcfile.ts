import * as fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import type { PresetMap } from "./presets";
import { localFolder } from "./workspace";
export const RC_FILENAME = ".focusmoderc.json";
export interface RcFile {
  presets?: PresetMap;
  order?: string[];
  default?: string;
  extends?: Record<string, string>;
  [key: string]: unknown;
}
export type RcSnapshot =
  | { kind: "missing" }
  | { kind: "invalid"; reason: string }
  | { kind: "valid"; rc: RcFile; raw: Record<string, unknown>; bare: boolean; revision: string; identity: string; mode: number; linked: boolean };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const globs = (value: unknown): boolean => object(value) && Object.values(value).every(item => typeof item === "boolean");
const presets = (value: unknown): boolean => object(value) && Object.entries(value).every(([name,item]) => Boolean(name) && globs(item));
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
export function rcFilePath(folder?: vscode.WorkspaceFolder): string { return path.join(localFolder(folder).uri.fsPath, RC_FILENAME); }
export async function readRcSnapshot(folder?: vscode.WorkspaceFolder): Promise<RcSnapshot> {
  const p = rcFilePath(folder);
  try {
    const before = await fs.lstat(p);
    if (before.size > 1_048_576) return { kind: "invalid", reason: "The preset file exceeds 1 MiB." };
    const bytes = await fs.readFile(p);
    if (bytes.length > 1_048_576) return {kind:"invalid",reason:"The preset file exceeds 1 MiB."};
    const after = await fs.lstat(p);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size)
      return { kind: "invalid", reason: "The preset file changed while it was read. Try again." };
    const raw: unknown = JSON.parse(bytes.toString("utf8"));
    if (!object(raw)) return { kind: "invalid", reason: "The preset file must contain a JSON object." };
    const bare = !["presets","order","default","extends"].some(key => Object.hasOwn(raw,key));
    if (bare ? !presets(raw) :
      (raw.presets !== undefined && !presets(raw.presets)) ||
      (raw.order !== undefined && (!Array.isArray(raw.order) || !raw.order.every(value => typeof value === "string"))) ||
      (raw.default !== undefined && typeof raw.default !== "string") ||
      (raw.extends !== undefined && (!object(raw.extends) || !Object.values(raw.extends).every(value => typeof value === "string"))))
      return { kind: "invalid", reason: "Preset patterns must be true/false; order, default and inheritance must use preset names." };
    return { kind: "valid", raw, rc: bare ? { presets: raw as PresetMap } : raw as RcFile, bare,
      revision: hash(bytes), identity: `${after.dev}:${after.ino}`, mode: after.mode & 0o777, linked: after.isSymbolicLink() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
    return { kind: "invalid", reason: "The preset file cannot be read as valid JSON. Edit it before changing presets." };
  }
}
export async function readRcFile(folder?: vscode.WorkspaceFolder): Promise<RcFile | undefined> {
  const snapshot = await readRcSnapshot(folder);
  if (snapshot.kind === "invalid") throw new Error(snapshot.reason);
  return snapshot.kind === "valid" ? snapshot.rc : undefined;
}
export async function hasRcFile(folder?: vscode.WorkspaceFolder): Promise<boolean> { return (await readRcSnapshot(folder)).kind !== "missing"; }
export function sameRc(a: RcSnapshot, b: RcSnapshot): boolean {
  return a.kind === "missing" && b.kind === "missing" || a.kind === "valid" && b.kind === "valid" && a.revision === b.revision && a.identity === b.identity;
}
export async function writeRcFile(rc: RcFile, folder?: vscode.WorkspaceFolder, expected?: RcSnapshot): Promise<void> {
  const target = localFolder(folder); const before = expected ?? await readRcSnapshot(target);
  if (before.kind === "invalid") throw new Error(before.reason);
  if (before.kind === "valid" && before.linked) throw new Error("Linked preset files are read-only. Edit their target directly.");
  const p = rcFilePath(target); const temporary = `${p}.tmp.${randomUUID()}`;
  const raw = before.kind === "valid" && before.bare ? rc.presets ?? {} : rc;
  try {
    await fs.writeFile(temporary, JSON.stringify(raw,null,2)+"\n", { flag: "wx", mode: before.kind === "valid" ? before.mode : 0o600 });
    if (!sameRc(before, await readRcSnapshot(target))) throw new Error("The preset file changed. Review it and try again.");
    if (before.kind === "missing") await fs.link(temporary,p);
    else await fs.rename(temporary,p);
  } finally { await fs.rm(temporary,{force:true}); }
}
export async function deleteRcFile(folder?: vscode.WorkspaceFolder, expected?: RcSnapshot): Promise<boolean> {
  const target=localFolder(folder);const before=expected ?? await readRcSnapshot(target);
  if (before.kind === "invalid") throw new Error(before.reason);
  if (before.kind === "missing") return false;
  if (before.linked) throw new Error("Linked preset files are read-only. Edit their target directly.");
  if (!sameRc(before,await readRcSnapshot(target))) throw new Error("The preset file changed. Review it and try again.");
  await fs.unlink(rcFilePath(target)); return true;
}
