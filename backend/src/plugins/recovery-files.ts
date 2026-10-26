import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { StorageError } from '../storage-contract.js';
import { checkFilesystem, localPath, regularFile } from './storage-path.js';

const windowsPrivate = `
$ErrorActionPreference = 'Stop'
$path = $env:RECORDER_PRIVATE_DIRECTORY
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$security = [System.Security.AccessControl.DirectorySecurity]::new()
$security.SetOwner($sid)
$security.SetAccessRuleProtection($true, $false)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$security.AddAccessRule($rule)
[System.IO.Directory]::CreateDirectory($path, $security) | Out-Null
$acl = [System.IO.Directory]::GetAccessControl($path)
if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Directory owner/protection mismatch' }
$rules = $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
if (-not ($rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -eq $sid.Value -and ($_.FileSystemRights -band 2032127) -eq 2032127 })) { throw 'Owner lacks full control' }
if ($rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $sid.Value }) { throw 'Other principals have access' }
`;
/** Existing permissions are checked, never silently rewritten or broadened. */
export function privateDirectory(directory: string) {
  const path = localPath(directory);
  checkFilesystem(dirname(path));
  try {
    if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsPrivate],
      { env: { ...process.env, RECORDER_PRIVATE_DIRECTORY: path }, windowsHide: true, stdio: 'pipe' });
    else mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (process.platform !== 'linux' || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw new StorageError('PERMISSION_DENIED', 'Cannot establish a private recovery directory', { cause: error });
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform === 'linux' &&
    ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid!()))) throw new StorageError('PERMISSION_DENIED', 'Recovery directory is not private to this user');
  return resolve(path);
}
export function writePrivate(path: string, value: string) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, value, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
}
export function syncFile(path: string) {
  const fd = openSync(path, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function syncDirectory(path: string) {
  // Windows Node cannot fsync a directory handle. Rename is still the visibility boundary, not a power-loss guarantee.
  if (process.platform === 'win32') return;
  const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function fileDigest(path: string) {
  regularFile(path);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function readPrivate(path: string) { regularFile(path); return readFileSync(path, 'utf8'); }
