import { chmod, rename, writeFile } from 'node:fs/promises';

/** Owner read and write only: the files under DATA_DIR hold keys and tokens. */
const PRIVATE_FILE_MODE = 0o600;

/**
 * Writes a value as JSON atomically: tmp file in the same dir, chmod 0600, rename over the target.
 *
 * @param file - The target path.
 * @param value - What to serialise, with two-space indent and a trailing newline.
 */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: PRIVATE_FILE_MODE });
  await chmod(tmp, PRIVATE_FILE_MODE);
  await rename(tmp, file);
}
