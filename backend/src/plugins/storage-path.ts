import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, statfsSync } from 'node:fs';
import { dirname, resolve, parse, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { StorageError } from '../storage-contract.js';

/** Restrict to explicitly supported local filesystems; no URI, ADS, network or device paths. */
export function localPath(filename: string): string {
  if (typeof filename !== 'string' || !filename || filename.trim() !== filename || filename.includes('\0') || /^file:/i.test(filename)) throw new StorageError('PATH_UNSUPPORTED', 'A local filesystem path is required');
  const path = resolve(filename);
  if (process.platform === 'win32') {
    if (!/^[a-z]:\\/i.test(path) || path.slice(2).includes(':') || /[. ]$/.test(basename(path))) throw new StorageError('PATH_UNSUPPORTED', 'Network, device and alternate-stream paths are not supported');
    try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$d = [System.IO.DriveInfo]::new($env:RECORDER_STORAGE_DRIVE); if ($d.DriveType -ne "Fixed" -or $d.DriveFormat -ne "NTFS") { exit 2 }'],
      { env: { ...process.env, RECORDER_STORAGE_DRIVE: parse(path).root }, windowsHide: true, stdio: 'pipe' }); }
    catch (error) { throw new StorageError('PATH_UNSUPPORTED', 'Storage requires a fixed local NTFS drive and Windows PowerShell', { cause: error }); }
  } else if (process.platform !== 'linux') throw new StorageError('PATH_UNSUPPORTED', 'Only tested Windows and Linux hosts are supported');
  return path;
}
export function checkFilesystem(path: string) {
  if (process.platform === 'linux' && !new Set([0xef53, 0x58465342, 0x9123683e, 0x01021994, 0x794c7630]).has(statfsSync(path).type >>> 0)) {
    throw new StorageError('PATH_UNSUPPORTED', 'This filesystem has not been validated for local storage ownership');
  }
}
export function canonicalDatabase(filename: string): string {
  const path = localPath(filename);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let result: string;
  if (existsSync(path)) {
    result = realpathSync.native(path);
    const stat = statSync(result);
    if (!stat.isFile() || stat.nlink !== 1) throw new StorageError('PATH_UNSUPPORTED', 'Database must be a regular file with a single hard link');
    if (process.platform === 'linux' && readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(line =>
      line.split(' ')[4]?.replace(/\\([0-7]{3})/g, (_, digits: string) => String.fromCharCode(parseInt(digits, 8))) === result)) {
      throw new StorageError('PATH_UNSUPPORTED', 'File bind mounts are not supported database aliases');
    }
  } else {
    if (lstatIfPresent(path)) throw new StorageError('PATH_UNSUPPORTED', 'Dangling database links are not supported');
    result = resolve(realpathSync.native(dirname(path)), basename(path));
  }
  checkFilesystem(dirname(result));
  if (parse(result).root !== parse(path).root) localPath(result);
  return result;
}
export function lstatIfPresent(path: string) {
  try { return lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
}
export function regularFile(path: string) {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw new StorageError('PATH_UNSUPPORTED', 'Linked or nonregular storage control files are not supported');
  return stat;
}
export function ensureControlFile(path: string) {
  try { closeSync(openSync(path, 'wx', 0o600)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  return regularFile(path);
}
