import type { Session } from '@opencode-ai/sdk/v2';

export type SessionMetadataRecord = Record<string, unknown>;

type TaskHunterMetadata = {
  kind?: 'review';
  originalSessionID?: string;
  reviewSessionID?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const getSessionMetadata = (session: Session | null | undefined): SessionMetadataRecord => {
  const metadata = (session as (Session & { metadata?: unknown }) | null | undefined)?.metadata;
  return isRecord(metadata) ? metadata : {};
};

const getTaskHunterMetadata = (metadata: SessionMetadataRecord): TaskHunterMetadata => {
  const value = metadata.taskhunter;
  return isRecord(value) ? value as TaskHunterMetadata : {};
};

export const getReviewSessionID = (session: Session | null | undefined): string | null => {
  const value = getTaskHunterMetadata(getSessionMetadata(session)).reviewSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const getOriginalSessionID = (session: Session | null | undefined): string | null => {
  const value = getTaskHunterMetadata(getSessionMetadata(session)).originalSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const isReviewSession = (session: Session | null | undefined): boolean =>
  getTaskHunterMetadata(getSessionMetadata(session)).kind === 'review' && Boolean(getOriginalSessionID(session));

export const withReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getTaskHunterMetadata(metadata);
  return {
    ...metadata,
    taskhunter: {
      ...current,
      reviewSessionID,
    },
  };
};

export const withReviewSessionMarker = (
  metadata: SessionMetadataRecord,
  originalSessionID: string,
): SessionMetadataRecord => {
  const current = getTaskHunterMetadata(metadata);
  return {
    ...metadata,
    taskhunter: {
      ...current,
      kind: 'review' as const,
      originalSessionID,
    },
  };
};

export const withoutReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getTaskHunterMetadata(metadata);
  if (current.reviewSessionID !== reviewSessionID) return metadata;

  const restTaskHunter = { ...current };
  delete restTaskHunter.reviewSessionID;
  const next: SessionMetadataRecord = { ...metadata };
  if (Object.keys(restTaskHunter).length > 0) {
    next.taskhunter = restTaskHunter;
  } else {
    delete next.taskhunter;
  }
  return next;
};
