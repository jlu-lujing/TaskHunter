import { z } from 'zod';
import type { Metadata, Session } from '@/lib/opencode/model';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';

/**
 * A pin lives in the session's metadata, `session.metadata.taskhunter.pinned`,
 * so every client of the server sees it, the way In work state travels. The
 * sidebar and the lists match pins by a key of runtime, directory and session:
 * the same session id can appear under two directories, and a runtime switch
 * must not carry one server's pins onto another.
 */
export const getPinnedSessionKey = (runtimeKey: string, directory: string, sessionId: string): string | null => {
  const normalizedDirectory = normalizePath(directory);
  if (!runtimeKey || !normalizedDirectory || !sessionId) return null;
  return JSON.stringify([runtimeKey, normalizedDirectory, sessionId]);
};

export const isSessionPinned = (ids: ReadonlySet<string>, directory: string | null | undefined, sessionId: string): boolean => {
  if (!directory) return false;
  const key = getPinnedSessionKey(getRuntimeKey(), directory, sessionId);
  return key ? ids.has(key) : false;
};

const pinnedSchema = z.object({ taskhunter: z.object({ pinned: z.object({ at: z.number() }) }) });

export const isSessionPinnedInMetadata = (session: Session | null | undefined): boolean => (
  pinnedSchema.safeParse(session?.metadata).success
);

const taskhunterSchema = z.object({ taskhunter: z.record(z.string(), z.json()) });

/** The metadata after the user pinned (`at` = when) or unpinned the session. */
export function withSessionPinned(metadata: Metadata, pinned: boolean, now: number): Metadata {
  const namespace = taskhunterSchema.safeParse(metadata).data?.taskhunter ?? {};
  const isPinned = pinnedSchema.safeParse(metadata).success;
  if (isPinned === pinned) return metadata;
  if (pinned) return { ...metadata, taskhunter: { ...namespace, pinned: { at: now } } };
  const rest = { ...namespace };
  delete rest.pinned;
  return { ...metadata, taskhunter: rest };
}
