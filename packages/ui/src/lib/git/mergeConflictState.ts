export type ConflictOperation = 'merge' | 'rebase';

/**
 * Persistent handoff for an unresolved merge/rebase conflict between the two
 * git surfaces (the Git panel and the commit graph), both of which restore
 * the conflict dialog from here on mount — the surfaces remount on every
 * switch, so without this the dialog would vanish mid-operation.
 *
 * State is stored as plain string entries (one key per field) rather than a
 * JSON document: a read either decodes cleanly or reports "nothing stored",
 * so a half-written or foreign value can never open a dialog with a
 * half-trusted shape. Git paths cannot contain newlines, which keeps the
 * file-list encoding exact.
 *
 * The key is per-session; a value whose directory no longer matches the
 * effective repository is dropped, never shown. The pre-field-key JSON format
 * under the base key is removed on load rather than decoded.
 */
export const saveConflictState = (
  key: string,
  state: { directory: string; conflictFiles: string[]; operation: ConflictOperation },
): void => {
  try {
    localStorage.setItem(`${key}.directory`, state.directory);
    localStorage.setItem(`${key}.operation`, state.operation);
    localStorage.setItem(`${key}.files`, state.conflictFiles.join('\n'));
    localStorage.removeItem(key);
  } catch {
    /* best-effort: a missing restore beats a failed git action */
  }
};

export const loadConflictState = (
  key: string,
): { directory: string; conflictFiles: string[]; operation: ConflictOperation } | null => {
  try {
    // A leftover from the JSON format carries no field keys; discard it so a
    // stale document cannot shadow (or resurrect into) the current format.
    localStorage.removeItem(key);
    const directory = localStorage.getItem(`${key}.directory`);
    const operation = localStorage.getItem(`${key}.operation`);
    const files = localStorage.getItem(`${key}.files`);
    if (directory === null || files === null) return null;
    if (operation !== 'merge' && operation !== 'rebase') return null;
    return { directory, conflictFiles: files === '' ? [] : files.split('\n'), operation };
  } catch {
    return null;
  }
};

export const clearConflictState = (key: string): void => {
  try {
    localStorage.removeItem(`${key}.directory`);
    localStorage.removeItem(`${key}.operation`);
    localStorage.removeItem(`${key}.files`);
    localStorage.removeItem(key);
  } catch {
    /* already gone for our purposes */
  }
};
