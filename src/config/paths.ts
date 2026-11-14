import fs from 'fs';
import path from 'path';

/** Single storage root for every store. Set DATA_DIR per client deployment. */
export function dataDir(...parts: string[]): string {
  return path.resolve(process.env.DATA_DIR || '.marketing-data', ...parts);
}

/** Write via tmp file + rename so a crash mid-write never leaves a truncated file. */
export function writeFileAtomic(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
