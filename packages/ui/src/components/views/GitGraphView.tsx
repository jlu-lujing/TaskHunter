import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui/toast';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useNestedGitDirectory } from '@/hooks/useNestedGitDirectory';
import { useGitStore, useGitStatus, useIsGitRepo } from '@/stores/useGitStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  clearConflictState as clearStoredConflictState,
  loadConflictState,
  saveConflictState,
  type ConflictOperation,
} from '@/lib/git/mergeConflictState';
import type { CommitFileEntry, GitLogResponse } from '@/lib/api/types';
import { HistorySection } from './git/HistorySection';
import { ConflictDialog } from './git/ConflictDialog';
import { NestedRepoResolutionStates } from './git/NestedRepoResolutionStates';

const GitNotReadyState: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-full items-center justify-center">
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon name="loader-4" className="size-4 animate-spin" />
      <span className="typography-ui-label">{label}</span>
    </div>
  </div>
);



type GitGraphViewProps = {
  isActive: boolean;
};

/**
 * Standalone commit-graph surface: every commit of the effective repository as
 * a colored lane graph with ref badges, expandable commit details (files with
 * inline diffs), and per-commit actions. Reuses the same lane renderer, commit
 * rows, and conflict dialog as the Git panel; unlike the Git panel it trades
 * status/staging for the full-history view.
 */
export const GitGraphView: React.FC<GitGraphViewProps> = ({ isActive }) => {
  const { t } = useI18n();
  const { git } = useRuntimeAPIs();
  const currentDirectory = useEffectiveDirectory();
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId);

  // Same resolution as the Git panel: the hook probes the root, discovers
  // nested repositories, and returns the effective repository directory.
  const { rootIsGitRepo, gitDirectory, nestedRepos } = useNestedGitDirectory(
    currentDirectory ?? null,
    { enabled: isActive },
  );
  const isGitRepo = useIsGitRepo(gitDirectory ?? null);
  const status = useGitStatus(gitDirectory ?? null);
  const { fetchStatus, fetchBranches, ensureNestedRepos } = useGitStore(useShallow((state) => ({
    fetchStatus: state.fetchStatus,
    fetchBranches: state.fetchBranches,
    ensureNestedRepos: state.ensureNestedRepos,
  })));

  const [graphLog, setGraphLog] = React.useState<GitLogResponse | null>(null);
  const [graphLogLoading, setGraphLogLoading] = React.useState(false);
  const [graphLogMaxCount, setGraphLogMaxCount] = React.useState(100);
  const [graphLogRefreshToken, setGraphLogRefreshToken] = React.useState(0);

  const [expandedCommitHashes, setExpandedCommitHashes] = React.useState<Set<string>>(new Set());
  const [commitFilesMap, setCommitFilesMap] = React.useState<Map<string, CommitFileEntry[]>>(new Map());
  const [loadingCommitHashes, setLoadingCommitHashes] = React.useState<Set<string>>(new Set());
  const commitFilesMapRef = React.useRef(commitFilesMap);
  const loadingCommitHashesRef = React.useRef(loadingCommitHashes);

  const [conflictDialogOpen, setConflictDialogOpen] = React.useState(false);
  const [conflictFiles, setConflictFiles] = React.useState<string[]>([]);
  const [conflictOperation, setConflictOperation] = React.useState<ConflictOperation>('merge');

  // Shares the Git panel's per-session conflict key, so an unresolved
  // merge/rebase conflict dialog follows the user between the two surfaces.
  const conflictStorageKey = React.useMemo(() => {
    if (!currentSessionId) return null;
    return `taskhunter.conflict:${currentSessionId}`;
  }, [currentSessionId]);

  const persistConflictState = React.useCallback((
    directory: string,
    files: string[],
    operation: ConflictOperation,
  ) => {
    if (!conflictStorageKey) return;
    saveConflictState(conflictStorageKey, { directory, conflictFiles: files, operation });
  }, [conflictStorageKey]);

  const clearConflictState = React.useCallback(() => {
    if (!conflictStorageKey) return;
    clearStoredConflictState(conflictStorageKey);
  }, [conflictStorageKey]);

  React.useEffect(() => {
    if (!conflictStorageKey || !gitDirectory) return;

    const parsed = loadConflictState(conflictStorageKey);
    if (!parsed) return;
    if (parsed.directory !== gitDirectory) {
      clearStoredConflictState(conflictStorageKey);
      return;
    }
    setConflictFiles(parsed.conflictFiles);
    setConflictOperation(parsed.operation);
    setConflictDialogOpen(true);
  }, [conflictStorageKey, gitDirectory]);

  const refreshRepository = React.useCallback(() => {
    if (!gitDirectory) return;
    void fetchStatus(gitDirectory, git);
    void fetchBranches(gitDirectory, git);
    setGraphLogRefreshToken((token) => token + 1);
  }, [gitDirectory, git, fetchStatus, fetchBranches]);

  React.useEffect(() => {
    setGraphLog(null);
  }, [gitDirectory]);

  React.useEffect(() => {
    if (!isActive || !gitDirectory) return;
    void fetchStatus(gitDirectory, git).catch(() => {});
  }, [isActive, gitDirectory, git, fetchStatus]);

  React.useEffect(() => {
    if (!isActive || !gitDirectory) {
      setGraphLogLoading(false);
      return;
    }
    let cancelled = false;
    setGraphLogLoading(true);
    git.getGitLog(gitDirectory, { maxCount: graphLogMaxCount, all: true })
      .then((result) => {
        if (!cancelled) setGraphLog(result);
      })
      .catch((err) => {
        console.error('Failed to fetch graph log:', err);
      })
      .finally(() => {
        if (!cancelled) setGraphLogLoading(false);
      });
    return () => { cancelled = true; };
  }, [isActive, gitDirectory, graphLogMaxCount, graphLogRefreshToken, git]);

  React.useEffect(() => {
    commitFilesMapRef.current = commitFilesMap;
  }, [commitFilesMap]);

  React.useEffect(() => {
    loadingCommitHashesRef.current = loadingCommitHashes;
  }, [loadingCommitHashes]);

  // Load a commit's files when its row is expanded for the first time.
  React.useEffect(() => {
    if (!gitDirectory || !git) return;

    const hashesToLoad = Array.from(expandedCommitHashes).filter(
      (hash) => !commitFilesMapRef.current.has(hash) && !loadingCommitHashesRef.current.has(hash),
    );
    if (hashesToLoad.length === 0) return;

    let cancelled = false;

    setLoadingCommitHashes((prev) => {
      const next = new Set(prev);
      for (const hash of hashesToLoad) {
        next.add(hash);
      }
      loadingCommitHashesRef.current = next;
      return next;
    });

    void Promise.all(
      hashesToLoad.map((hash) =>
        git
          .getCommitFiles(gitDirectory, hash)
          .then((response) => ({ hash, files: response.files }))
          .catch((error) => {
            console.error('Failed to fetch commit files:', error);
            return { hash, files: [] };
          })
      )
    ).then((results) => {
      if (cancelled) return;
      setCommitFilesMap((prev) => {
        const next = new Map(prev);
        for (const { hash, files } of results) {
          next.set(hash, files);
        }
        commitFilesMapRef.current = next;
        return next;
      });
      setLoadingCommitHashes((prev) => {
        const next = new Set(prev);
        for (const { hash } of results) {
          next.delete(hash);
        }
        loadingCommitHashesRef.current = next;
        return next;
      });
    });

    return () => {
      cancelled = true;
      setLoadingCommitHashes((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const hash of hashesToLoad) {
          if (next.delete(hash)) {
            changed = true;
          }
        }
        if (!changed) {
          return prev;
        }
        loadingCommitHashesRef.current = next;
        return next;
      });
    };
  }, [expandedCommitHashes, gitDirectory, git]);

  const handleToggleCommit = React.useCallback((hash: string) => {
    setExpandedCommitHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  const handleCopyCommitHash = React.useCallback((hash: string) => {
    void copyTextToClipboard(hash).then((result) => {
      if (result.ok) {
        toast.success(t('gitView.toast.commitHashCopied'));
        return;
      }
      toast.error(t('gitView.toast.copyFailed'));
    });
  }, [t]);

  // Row actions surface conflicts differently per operation: cherry-pick/revert
  // conflicts have no dialog in the shared flow (the operation stays pending in
  // the working tree and the toast carries manual-resolution steps), while
  // merge/rebase conflicts open the shared ConflictDialog.
  const handleConflict = React.useCallback((result: {
    conflict: boolean;
    conflictFiles?: string[];
    operation: 'cherry-pick' | 'revert' | 'merge' | 'rebase';
  }) => {
    if (!result.conflict) return;

    if (result.operation === 'cherry-pick' || result.operation === 'revert') {
      toast.error(t('gitView.history.actions.conflictToastTitle'), {
        description: t('gitView.history.actions.conflictToastDescription', {
          files: result.conflictFiles?.join(', ') ?? 'unknown files',
        }),
      });
      refreshRepository();
      return;
    }

    setConflictFiles(result.conflictFiles ?? []);
    setConflictOperation(result.operation);
    setConflictDialogOpen(true);
    if (gitDirectory) {
      persistConflictState(gitDirectory, result.conflictFiles ?? [], result.operation);
    }
    refreshRepository();
  }, [t, gitDirectory, persistConflictState, refreshRepository]);

  const handleAbortConflict = React.useCallback(async () => {
    if (!gitDirectory) return;

    try {
      if (conflictOperation === 'merge') {
        await git.abortMerge(gitDirectory);
        toast.success(t('gitView.toast.mergeAborted'));
      } else {
        await git.abortRebase(gitDirectory);
        toast.success(t('gitView.toast.rebaseAborted'));
      }
      clearConflictState();
      void fetchStatus(gitDirectory, git);
      void fetchBranches(gitDirectory, git);
      setGraphLogRefreshToken((token) => token + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to abort ${conflictOperation}`;
      toast.error(message);
    }
  }, [gitDirectory, git, conflictOperation, clearConflictState, fetchStatus, fetchBranches, t]);

  if (!currentDirectory) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="typography-ui-label text-muted-foreground">
          {t('gitView.empty.selectSessionOrDirectory')}
        </p>
      </div>
    );
  }

  if (isGitRepo === null) {
    return <GitNotReadyState label={t('gitView.loading.checkingRepository')} />;
  }

  if (isGitRepo === false) {
    return (
      <NestedRepoResolutionStates
        rootIsGitRepo={rootIsGitRepo}
        resolvedIsGitRepo={isGitRepo}
        nestedRepos={nestedRepos}
        onRetryDiscovery={() => {
          if (currentDirectory) {
            void ensureNestedRepos(currentDirectory, { force: true });
          }
        }}
      />
    );
  }

  const repoBasename = gitDirectory ? gitDirectory.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() : null;

  return (
    <div className="flex h-full flex-col overflow-hidden px-4 pt-1 pb-4 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {status?.current ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-2 py-1 typography-micro text-muted-foreground">
            <Icon name="git-branch" className="size-3 shrink-0" />
            <span className="truncate" title={status.current}>{status.current}</span>
          </span>
        ) : null}
        {repoBasename && repoBasename !== currentDirectory.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ? (
          <span className="truncate typography-micro text-muted-foreground" title={gitDirectory ?? undefined}>{repoBasename}</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 shrink-0 gap-1.5 px-2"
          onClick={refreshRepository}
          disabled={graphLogLoading}
          title={t('gitView.history.refresh')}
          aria-label={t('gitView.history.refresh')}
        >
          <Icon name="refresh" className={graphLogLoading ? 'size-4 animate-spin' : 'size-4'} />
          {t('gitView.history.refresh')}
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <HistorySection
          mode="graph"
          log={graphLog}
          isLogLoading={graphLogLoading}
          logMaxCount={graphLogMaxCount}
          onLogMaxCountChange={setGraphLogMaxCount}
          expandedCommitHashes={expandedCommitHashes}
          onToggleCommit={handleToggleCommit}
          commitFilesMap={commitFilesMap}
          loadingCommitHashes={loadingCommitHashes}
          onCopyHash={handleCopyCommitHash}
          directory={gitDirectory ?? undefined}
          showHeader={false}
          contentMaxHeightClassName="h-full max-h-none"
          onConflict={handleConflict}
          onActionSuccess={refreshRepository}
        />
      </div>

      {gitDirectory && (
        <ConflictDialog
          open={conflictDialogOpen}
          onOpenChange={setConflictDialogOpen}
          conflictFiles={conflictFiles}
          directory={gitDirectory}
          operation={conflictOperation}
          onAbort={handleAbortConflict}
          onClearState={clearConflictState}
        />
      )}
    </div>
  );
};
