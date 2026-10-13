import { errorMessage } from '../core/errors.ts';

/**
 * Parses and validates one config file's text.
 *
 * @typeParam T - The validated shape.
 * @param file - The file's path, named in the error.
 * @param raw - The file's text.
 * @param parse - Validates the parsed JSON; throws to reject it.
 * @returns The validated value. Throws an Error naming the file when the JSON or the validation fails.
 */
export function parseConfigFile<T>(file: string, raw: string, parse: (value: unknown) => T): T {
  const json = parseJson(file, raw);
  try {
    return parse(json);
  } catch (cause) {
    throw new Error(`${file} failed validation: ${errorMessage(cause)}`, { cause });
  }
}

/**
 * Parses one config file's text as JSON.
 *
 * @param file - The file's path, named in the error.
 * @param raw - The file's text.
 * @returns The parsed value. Throws an Error naming the file when the text is not JSON.
 */
function parseJson(file: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`${file} is not valid JSON: ${errorMessage(cause)}`, { cause });
  }
}
