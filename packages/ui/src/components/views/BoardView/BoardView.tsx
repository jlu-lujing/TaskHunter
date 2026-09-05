import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/components/ui/toast';
import { PROJECT_COLOR_MAP } from '@/lib/projectMeta';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveGlobalSessionDirectory } from '@/stores/globalSessionStructure';
import { formatSessionDateLabel } from '@/components/session/sidebar/utils';
import type { Session } from '@opencode-ai/sdk/v2';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { useBoardStore, type BoardCreateInput } from '@/stores/useBoardStore';
import {
  BOARD_COLUMNS,
  BOARD_STATUSES,
  BOARD_STATUS_BY_VALUE,
  BOARD_STATUS_LABEL_KEYS,
  badgeStatusFor,
  filterTasksByProject,
  groupTasksByColumn,
  nextStatus,
  previousStatus,
  type BoardStatus,
  type BoardTask,
} from './boardModel';

const ALL_PROJECTS = '__all__';
const NO_PROJECT = '__none__';

type EditorState = {
  open: boolean;
  task: BoardTask | null;
  title: string;
  description: string;
  projectId: string;
  labels: string;
  status: BoardStatus;
};

const closedEditor: EditorState = {
  open: false,
  task: null,
  title: '',
  description: '',
  projectId: ALL_PROJECTS,
  labels: '',
  status: 'backlog',
};

function parseLabels(raw: string): string[] {
  const seen = new Set<string>();
  for (const entry of raw.split(/[,\n]/)) {
    const label = entry.trim();
    if (label) seen.add(label);
  }
  return [...seen].slice(0, 20);
}

export function BoardView(): React.ReactNode {
  const { t } = useI18n();
  const open = useUIStore((state) => state.isBoardPageOpen);
  const setOpen = useUIStore((state) => state.setBoardPageOpen);
  const projects = useProjectsStore((state) => state.projects);

  const tasks = useBoardStore((state) => state.tasks);
  const loadState = useBoardStore((state) => state.loadState);
  const loadError = useBoardStore((state) => state.loadError);
  const load = useBoardStore((state) => state.load);
  const createTask = useBoardStore((state) => state.createTask);
  const updateTask = useBoardStore((state) => state.updateTask);
  const deleteTask = useBoardStore((state) => state.deleteTask);
  const evaluateTask = useBoardStore((state) => state.evaluateTask);
  const initRepo = useBoardStore((state) => state.initRepo);
  const taskAction = useBoardStore((state) => state.taskAction);
  const boardConfig = useBoardStore((state) => state.config);
  const updateConfig = useBoardStore((state) => state.updateConfig);
  const mutating = useBoardStore((state) => state.mutating);
  const mutationError = useBoardStore((state) => state.mutationError);

  const [filterProjectId, setFilterProjectId] = React.useState<string>(ALL_PROJECTS);
  const [editor, setEditor] = React.useState<EditorState>(closedEditor);
  const [detailTask, setDetailTask] = React.useState<BoardTask | null>(null);
  const [contextTaskId, setContextTaskId] = React.useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [returnDialog, setReturnDialog] = React.useState<{ open: boolean; task: BoardTask | null; note: string }>({ open: false, task: null, note: '' });
  const [settingsDraft, setSettingsDraft] = React.useState<{ providerId: string; modelId: string; maxConcurrent: number; automationDefault: 'plan' | 'auto'; checkRetries: number; mergeRetries: number; maxAttempts: number } | null>(null);
  const sessionsByDirectory = useGlobalSessionsStore((state) => state.sessionsByDirectory);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);

  // Phone layout: one column per page with snap paging and a chip strip to
  // jump between them; wide viewports keep the full five-column grid.
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const columnRefs = React.useRef(new Map<(typeof BOARD_COLUMNS)[number]['id'], HTMLDivElement>());
  const [isNarrow, setIsNarrow] = React.useState(false);
  const [activeColumnId, setActiveColumnId] = React.useState<(typeof BOARD_COLUMNS)[number]['id']>('backlog');
  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const handleColumnsScroll = React.useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let nearest: (typeof BOARD_COLUMNS)[number]['id'] | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const column of BOARD_COLUMNS) {
      const el = columnRefs.current.get(column.id);
      if (!el) continue;
      const distance = Math.abs(el.offsetLeft - scroller.scrollLeft - (scroller.clientWidth - el.clientWidth) / 2);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = column.id;
      }
    }
    if (nearest) setActiveColumnId((prev) => (prev === nearest ? prev : nearest));
  }, []);
  const jumpToColumn = React.useCallback((columnId: (typeof BOARD_COLUMNS)[number]['id']) => {
    const scroller = scrollerRef.current;
    const el = columnRefs.current.get(columnId);
    if (!scroller || !el) return;
    // Constant padding offsets are fixed up by the mandatory snap points.
    scroller.scrollTo({ left: el.offsetLeft - (scroller.clientWidth - el.clientWidth) / 2, behavior: 'smooth' });
  }, []);

  React.useEffect(() => {
    // Force on open: claims move cards server-side; cached state can be stale.
    if (open) void load(true);
  }, [open, load]);

  const projectNames = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project.label ?? project.path.split('/').filter(Boolean).pop() ?? project.id])),
    [projects],
  );
  const projectColors = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project.color ? PROJECT_COLOR_MAP[project.color] ?? null : null])),
    [projects],
  );

  const sessions = React.useMemo(
    () => Array.from(sessionsByDirectory.values()).flat(),
    [sessionsByDirectory],
  );

  const visibleTasks = filterTasksByProject(
    tasks,
    filterProjectId === ALL_PROJECTS ? null : filterProjectId,
  );
  const grouped = groupTasksByColumn(visibleTasks);

  const openEditor = (task: BoardTask | null) => {
    setEditor(task
      ? {
        open: true,
        task,
        title: task.title,
        description: task.description,
        projectId: task.projectId ?? NO_PROJECT,
        labels: task.labels.join(', '),
        status: task.status,
      }
      : {
        ...closedEditor,
        open: true,
        projectId: filterProjectId === ALL_PROJECTS || !projects.length
          ? projects[0]?.id ?? NO_PROJECT
          : filterProjectId,
      });
  };

  const editorProjectId = (value: string): string | null => (value === NO_PROJECT ? null : value);

  type DetailSessionRow = {
    sessionId: string;
    session: Session | null;
    title: string;
    dateLabel: string | null;
    directory: string | null;
  };

  const detailSessionRows = (task: BoardTask): DetailSessionRow[] => task.sessionIds.map((sessionId) => {
    const session = sessions.find((entry) => entry.id === sessionId) ?? null;
    if (!session) {
      return { sessionId, session: null, title: sessionId, dateLabel: null, directory: null };
    }
    return {
      sessionId,
      session,
      title: session.title || sessionId,
      dateLabel: formatSessionDateLabel(session.time?.updated ?? session.time?.created ?? Date.now()),
      directory: resolveGlobalSessionDirectory(session),
    };
  });

  const openSessionFromTask = (sessionId: string, directory: string | null) => {
    setCurrentSession(sessionId, directory ?? undefined);
    setDetailTask(null);
    setOpen(false);
  };

  const tFallback = React.useCallback((key: string, fallback: string): string => {
    const value = t(key as never);
    return value === key ? fallback : value;
  }, [t]);

  const openReturnDialog = React.useCallback((task: BoardTask) => {
    setReturnDialog({ open: true, task, note: '' });
    setContextTaskId(null);
  }, []);

  const handleBlockedRetry = React.useCallback((task: BoardTask) => {
    const targetStatus: BoardStatus = task.evaluation?.plan ? 'queued' : 'planning';
    void updateTask(task.id, { status: targetStatus }).then((ok) => {
      if (ok) toast.success(tFallback('board.blocked.retrySuccess', 'Task requeued'));
      else toast.error(useBoardStore.getState().mutationError ?? tFallback('board.blocked.retryFailed', 'Failed to retry task'));
    });
  }, [updateTask, tFallback]);

  const handleSave = async () => {
    // Edit granularity: title/description edit on active pipeline statuses will reset to planning server-side
    if (editor.task) {
      const contentChanged = editor.title.trim() !== editor.task.title.trim() || editor.description.trim() !== (editor.task.description ?? '').trim();
      const willReset = contentChanged && (['queued', 'running', 'checking', 'review', 'merging'] as readonly BoardStatus[]).includes(editor.task.status);
      if (willReset) {
        const msg = tFallback('board.dialog.editWillReset', 'Editing title/description will move this card back to Planning and restart the workflow. Continue?');
        if (!window.confirm(msg)) return;
      }
    }
    const input: BoardCreateInput = {
      title: editor.title,
      description: editor.description,
      projectId: editorProjectId(editor.projectId),
      labels: parseLabels(editor.labels),
      status: editor.status,
    };
    const ok = editor.task
      ? await updateTask(editor.task.id, input)
      : await createTask(input);
    if (ok) setEditor(closedEditor);
  };

  const handleDelete = async () => {
    if (!editor.task) return;
    const ok = await deleteTask(editor.task.id);
    if (ok) setEditor(closedEditor);
  };

  const handleMenuDelete = async (task: BoardTask) => {
    const ok = await deleteTask(task.id);
    if (!ok) {
      toast.error(useBoardStore.getState().mutationError ?? t('board.card.menu.deleteFailed'));
    }
  };

  const renderCardMenu = (task: BoardTask) => {
    const plan = task.evaluation?.status === 'done' ? task.evaluation.plan : null;
    return (
      <>
        <ContextMenuItem onClick={() => setDetailTask(task)}>{t('board.card.menu.open')}</ContextMenuItem>
        <ContextMenuItem onClick={() => openEditor(task)}>{t('board.card.menu.edit')}</ContextMenuItem>
        {task.sessionRef ? (
          <ContextMenuItem onClick={() => openSessionFromTask(task.sessionRef!, task.sessionDirectoryRef ?? null)}>
            {t('board.card.menu.openSession')}
          </ContextMenuItem>
        ) : null}
        {task.pr?.url ? (
          <ContextMenuItem onClick={() => window.open(task.pr!.url!, '_blank', 'noreferrer')}>
            {t('board.card.menu.openPr')}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        {task.status !== 'backlog' ? (
          <ContextMenuItem onClick={() => void updateTask(task.id, { status: 'backlog' })}>
            {t('board.card.menu.moveToBacklog')}
          </ContextMenuItem>
        ) : null}
        {task.status !== 'planning' && task.status !== 'running' && task.status !== 'checking' && task.status !== 'merging' ? (
          <ContextMenuItem onClick={() => void updateTask(task.id, { status: 'planning' })}>
            {t('board.card.menu.moveToPlanning')}
          </ContextMenuItem>
        ) : null}
        {task.projectId ? (
          <ContextMenuItem
            disabled={mutating}
            onClick={() => {
              void initRepo(task.id).then((result) => {
                if (result === 'created') toast.success(t('board.card.menu.initRepoCreated'));
                else if (result === 'already') toast.success(t('board.card.menu.initRepoAlready'));
                else toast.error(useBoardStore.getState().mutationError ?? t('board.card.menu.initRepoFailed'));
              });
            }}
          >
            {t('board.card.menu.initRepo')}
          </ContextMenuItem>
        ) : null}
        {task.status === 'planning' && task.evaluation?.status === 'failed' ? (
          <ContextMenuItem onClick={() => void taskAction(task.id, 'retryEvaluation')}>
            {t('board.eval.retry')}
          </ContextMenuItem>
        ) : null}
        {task.status === 'planning' && plan ? (
          <ContextMenuItem onClick={() => void taskAction(task.id, 'approve')}>
            {t('board.planning.approve')}
          </ContextMenuItem>
        ) : null}
        {task.status === 'review' ? (
          <>
            {task.pr?.number && task.pr.state === 'open' ? (
              <ContextMenuItem onClick={() => void taskAction(task.id, 'merge')}>
                {t('board.review.merge')}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => void taskAction(task.id, 'accept')}>
                {t('board.review.accept')}
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => openReturnDialog(task)}>
              {t('board.review.return')}
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-[var(--status-error)] focus:text-[var(--status-error)]"
          disabled={mutating}
          onClick={() => void handleMenuDelete(task)}
        >
          {t('board.dialog.delete')}
        </ContextMenuItem>
      </>
    );
  };

  const renderCard = (task: BoardTask) => {
    const forward = nextStatus(task.status);
    const backward = previousStatus(task.status);
    const plan = task.evaluation?.status === 'done' ? task.evaluation.plan : null;
    const projectName = task.projectId ? projectNames.get(task.projectId) ?? task.projectId : null;
    const projectColor = task.projectId ? projectColors.get(task.projectId) : null;
    const stage = badgeStatusFor(task.status);
    return (
      <ContextMenu key={task.id} open={contextTaskId === task.id} onOpenChange={(next) => setContextTaskId(next ? task.id : null)}>
      <ContextMenuTrigger render={<div
        role="button"
        tabIndex={0}
        onClick={() => setDetailTask(task)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setDetailTask(task);
          }
        }}
        className="group/card w-full cursor-pointer rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-[var(--interactive-border)]"
      />}>
        {stage ? (
          <p className="mb-1 inline-flex rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
            {t(BOARD_STATUS_LABEL_KEYS[stage])}
          </p>
        ) : null}
        <p className="typography-ui-label line-clamp-2 text-foreground">{task.title}</p>
        {task.description ? (
          <p className="mt-1 line-clamp-2 typography-meta text-muted-foreground">{task.description}</p>
        ) : null}
        {task.status === 'planning' && task.evaluation?.status === 'running' ? (
          <p className="mt-1.5 inline-flex items-center gap-1 typography-micro text-muted-foreground">
            <Icon name="loader" className="size-3 animate-spin" />
            {t('board.eval.running')}
          </p>
        ) : null}
        {task.status === 'planning' && task.evaluation?.status === 'failed' ? (
          <p className="mt-1.5 inline-flex items-center gap-1 typography-micro text-[var(--status-error)]" title={task.evaluation.error ?? undefined}>
            <Icon name="alert" className="size-3" />
            {t('board.eval.failed')}
            <button
              type="button"
              className="ml-0.5 rounded p-0.5 hover:bg-interactive-hover"
              aria-label={t('board.eval.retry')}
              title={t('board.eval.retry')}
              onClick={(event) => {
                event.stopPropagation();
                void evaluateTask(task.id);
              }}
            >
              <Icon name="refresh" className="size-3" />
            </button>
          </p>
        ) : null}
        {plan ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
              {plan.deliverable === 'pr' ? t('board.eval.deliverable.pr') : t('board.eval.deliverable.report')}
            </span>
            <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
              {plan.review === 'green' ? t('board.eval.review.green') : t('board.eval.review.human')}
            </span>
            {task.status === 'planning' ? (
              <button
                type="button"
                className="ml-auto rounded px-1.5 py-0.5 typography-micro font-medium text-primary hover:bg-interactive-hover"
                aria-label={t('board.planning.approve')}
                title={t('board.planning.approve')}
                onClick={(event) => {
                  event.stopPropagation();
                  void taskAction(task.id, 'approve');
                }}
              >
                {t('board.planning.approve')}
              </button>
            ) : null}
          </div>
        ) : null}
        {task.status === 'checking' ? (
          <p className="mt-1.5 inline-flex items-center gap-1 typography-micro text-muted-foreground">
            <Icon name="loader" className="size-3 animate-spin" />
            {t('board.checking.verify')}
          </p>
        ) : null}
        {task.status === 'blocked' ? (
          <div className="mt-1.5 flex items-center gap-1">
            {task.blockedReason ? (
              <p className="line-clamp-1 flex-1 typography-micro text-[var(--status-error)]" title={task.blockedReason}>
                {task.blockedReason}
              </p>
            ) : (
              <span className="flex-1 typography-micro text-[var(--status-error)]">{tFallback('board.status.blocked', 'Blocked')}</span>
            )}
            <button
              type="button"
              className="shrink-0 rounded px-1.5 py-0.5 typography-micro font-medium text-primary hover:bg-interactive-hover"
              aria-label={tFallback('board.blocked.retry', 'Retry')}
              title={tFallback('board.blocked.retry', 'Retry')}
              onClick={(event) => {
                event.stopPropagation();
                handleBlockedRetry(task);
              }}
            >
              {tFallback('board.blocked.retry', 'Retry')}
            </button>
          </div>
        ) : null}
        {task.pr?.number && task.status !== 'done' ? (
          <div className="mt-1.5">
            {task.pr.url ? (
              <a
                href={task.pr.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground hover:text-foreground"
                title={task.pr.url}
                onClick={(event) => event.stopPropagation()}
              >
                <Icon name="git-pull-request" className="size-3" />
                {task.pr.number}
              </a>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
                <Icon name="git-pull-request" className="size-3" />
                {task.pr.number}
              </span>
            )}
          </div>
        ) : null}
        {task.status === 'merging' && task.queue ? (
          <p className="mt-1.5 inline-flex items-center gap-1 typography-micro text-muted-foreground">
            {task.queue.state === 'merging' ? <Icon name="loader" className="size-3 animate-spin" /> : null}
            {t(task.queue.state === 'merging' ? 'board.queue.merging' : task.queue.state === 'rebasing' ? 'board.queue.rebasing' : 'board.queue.queued')}
          </p>
        ) : null}
        {task.status === 'review' ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {task.pr?.number && task.pr.state === 'open' ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
                aria-label={t('board.review.merge')}
                title={t('board.review.merge')}
                onClick={(event) => {
                  event.stopPropagation();
                  void taskAction(task.id, 'merge');
                }}
              >
                <Icon name="git-pull-request" className="size-3.5" />
              </button>
            ) : null}
            {(!task.pr?.number || task.pr.state !== 'open') ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
                aria-label={t('board.review.accept')}
                title={t('board.review.accept')}
                onClick={(event) => {
                  event.stopPropagation();
                  void taskAction(task.id, 'accept');
                }}
              >
                <Icon name="check" className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
              aria-label={t('board.review.return')}
              title={t('board.review.return')}
              onClick={(event) => {
                event.stopPropagation();
                openReturnDialog(task);
              }}
            >
              <Icon name="corner-down-left" className="size-3.5" />
            </button>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {projectName ? (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: projectColor ?? 'var(--surface-mutedForeground)' }} />
              <span className="max-w-24 truncate">{projectName}</span>
            </span>
          ) : null}
          {task.labels.map((label) => (
            <span key={label} className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
              {label}
            </span>
          ))}
          {task.sessionIds.length > 0 ? (
            <span className="inline-flex items-center gap-0.5 typography-micro text-muted-foreground" title={t('board.card.sessions')}>
              <Icon name="chat-thread" className="size-3" />
              {task.sessionIds.length}
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 pointer-coarse:opacity-100">
            {backward ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
                aria-label={t('board.card.moveBack')}
                onClick={(event) => {
                  event.stopPropagation();
                  void updateTask(task.id, { status: backward });
                }}
              >
                <Icon name="arrow-left" className="size-3.5" />
              </button>
            ) : null}
            {forward ? (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
                aria-label={t('board.card.moveForward')}
                onClick={(event) => {
                  event.stopPropagation();
                  void updateTask(task.id, { status: forward });
                }}
              >
                <Icon name="arrow-right" className="size-3.5" />
              </button>
             ) : null}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">{renderCardMenu(task)}</ContextMenuContent>
      </ContextMenu>
    );
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex items-center gap-2 px-6 pt-4">
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t('board.back')}>
          <Icon name="arrow-left" className="size-4" />
        </Button>
        <h1 className="typography-ui-header text-foreground">{t('board.title')}</h1>
        <div className="ml-2 w-40 max-md:w-28">
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger aria-label={t('board.filterProject')} className="h-8">
              <SelectValue>
                {(value) => (value === ALL_PROJECTS
                  ? t('board.filter.allProjects')
                  : projectNames.get(String(value)) ?? String(value))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>{t('board.filter.allProjects')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {projectNames.get(project.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('board.settings.action')}
            title={t('board.settings.action')}
            onClick={() => {
              const model = (boardConfig?.defaultModel ?? '').split('/');
              setSettingsDraft({
                providerId: model.length >= 2 ? model[0] : '',
                modelId: model.length >= 2 ? model.slice(1).join('/') : '',
                maxConcurrent: boardConfig?.maxConcurrent ?? 2,
                automationDefault: boardConfig?.automationDefault ?? 'plan',
                checkRetries: boardConfig?.checkRetries ?? 2,
                mergeRetries: boardConfig?.mergeRetries ?? 2,
                maxAttempts: boardConfig?.maxAttempts ?? 2,
              });
              setSettingsOpen(true);
            }}
          >
            <Icon name="more" className="size-4" />
          </Button>
          <Button size="xs" className="!font-normal" onClick={() => openEditor(null)}>
            <Icon name="add" className="mr-1 size-3.5" />
            {t('board.newTask')}
          </Button>
        </div>
      </div>

      {loadState === 'error' ? (
        <div className="mx-6 mt-3 flex items-center gap-3 rounded-lg border border-[var(--status-error)]/40 px-3 py-2 typography-meta text-[var(--status-error)]">
          <span className="min-w-0 flex-1 truncate">{loadError}</span>
          <Button size="xs" variant="outline" className="!font-normal" onClick={() => void load(true)}>
            {t('board.retry')}
          </Button>
        </div>
      ) : null}

      {loadState === 'loading' || loadState === 'idle' ? (
        <div className="flex flex-1 items-center justify-center typography-meta text-muted-foreground">
          {t('board.loading')}
        </div>
      ) : (
        <>
          {isNarrow ? (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto px-6 max-md:px-4 pb-2">
              {BOARD_COLUMNS.map((column) => {
                const count = (grouped.get(column.id) ?? []).length;
                const active = activeColumnId === column.id;
                return (
                  <Button
                    key={column.id}
                    type="button"
                    variant="chip"
                    size="xs"
                    aria-pressed={active}
                    onClick={() => jumpToColumn(column.id)}
                    className="shrink-0 !font-normal"
                  >
                    {t(column.labelKey)}
                    <span className={cn('typography-micro', !active && 'text-muted-foreground')}>{count}</span>
                  </Button>
                );
              })}
            </div>
          ) : null}
          <div
            ref={scrollerRef}
            onScroll={isNarrow ? handleColumnsScroll : undefined}
            className={cn('min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 max-md:px-4 py-4', isNarrow && 'snap-x snap-mandatory')}
          >
            <div
              className={isNarrow ? 'flex h-full gap-3' : 'grid h-full min-w-full auto-cols-[minmax(240px,1fr)] grid-rows-1 gap-3'}
              style={isNarrow ? undefined : { gridTemplateColumns: `repeat(${BOARD_COLUMNS.length}, minmax(240px, 1fr))` }}
            >
            {BOARD_COLUMNS.map((column) => {
              const columnTasks = grouped.get(column.id) ?? [];
              const inProgressBreakdown = column.id === 'inProgress'
                ? (['planning', 'queued', 'running', 'checking', 'merging'] as const).map((status) => ({
                    status,
                    count: columnTasks.filter((taskItem) => taskItem.status === status).length,
                  }))
                : null;
              return (
                <div
                  key={column.id}
                  ref={(el) => {
                    if (el) columnRefs.current.set(column.id, el);
                    else columnRefs.current.delete(column.id);
                  }}
                  className={cn('flex min-h-0 flex-col rounded-xl bg-muted/40 p-2', isNarrow && 'w-[86%] max-w-[420px] shrink-0 snap-center')}
                >
                  <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2 typography-ui-label text-muted-foreground">
                    {column.id === 'done' ? <Icon name="check" className="size-3.5" /> : null}
                    {column.id === 'blocked' ? <Icon name="alert" className="size-3.5" /> : null}
                    <span>{t(column.labelKey)}</span>
                    <span className="typography-micro">{columnTasks.length}</span>
                    {inProgressBreakdown ? (
                      <span className="ml-1 flex flex-wrap items-center gap-1">
                        {inProgressBreakdown.map(({ status, count }) => {
                          const short = status === 'planning' ? 'P' : status === 'queued' ? 'Q' : status === 'running' ? 'R' : status === 'checking' ? 'C' : 'M';
                          return (
                            <span
                              key={status}
                              title={`${t(BOARD_STATUS_LABEL_KEYS[status])}: ${count}`}
                              className={cn('rounded px-1 py-0.5 typography-micro', count > 0 ? 'bg-[var(--surface-subtle)] text-foreground' : 'bg-transparent text-muted-foreground/60')}
                            >
                              {short}:{count}
                            </span>
                          );
                        })}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                    {columnTasks.map(renderCard)}
                    {columnTasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border/70 px-2 py-3 text-center typography-meta text-muted-foreground/70">
                        {t('board.column.empty')}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </>
      )}

      <Dialog open={detailTask !== null} onOpenChange={(next) => { if (!next) setDetailTask(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          {detailTask ? (
            <>
              <DialogHeader>
                <DialogTitle className="break-words">{detailTask.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {detailTask.projectId && projectNames.get(detailTask.projectId) ? (
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: projectColors.get(detailTask.projectId) ?? 'var(--surface-mutedForeground)' }} />
                      {projectNames.get(detailTask.projectId)}
                    </span>
                  ) : null}
                  <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">
                    {t(BOARD_STATUS_LABEL_KEYS[detailTask.status])}
                  </span>
                  {detailTask.labels.map((label) => (
                    <span key={label} className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground">{label}</span>
                  ))}
                  {detailTask.pr?.number && detailTask.pr.url ? (
                    <a
                      href={detailTask.pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-muted-foreground hover:text-foreground"
                    >
                      <Icon name="git-pull-request" className="size-3" />
                      {detailTask.pr.number}
                      {detailTask.pr.state}
                    </a>
                  ) : null}
                  {detailTask.status === 'blocked' ? (
                    <span className="inline-flex items-center gap-1.5">
                      {detailTask.blockedReason ? (
                        <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-[var(--status-error)]">{detailTask.blockedReason}</span>
                      ) : null}
                      <Button
                        size="xs"
                        variant="outline"
                        className="!font-normal"
                        onClick={() => {
                          const task = detailTask;
                          handleBlockedRetry(task);
                        }}
                      >
                        {tFallback('board.blocked.retry', 'Retry')}
                      </Button>
                    </span>
                  ) : detailTask.blockedReason ? (
                    <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 typography-micro text-[var(--status-error)]">{detailTask.blockedReason}</span>
                  ) : null}
                </div>
                {detailTask.description ? (
                  <p className="whitespace-pre-wrap typography-meta text-muted-foreground">{detailTask.description}</p>
                ) : null}
                {detailTask.evaluation?.plan ? (
                  <div className="rounded-lg border border-border/70 bg-[var(--surface-subtle)] p-2.5">
                    <p className="mb-1 typography-ui-label text-foreground">{t('board.eval.planTitle')}</p>
                    <p className="whitespace-pre-wrap typography-meta text-foreground">{detailTask.evaluation.plan.goalDefinition}</p>
                    <p className="mt-1.5 typography-micro text-muted-foreground">{detailTask.evaluation.plan.rationale}</p>
                    <p className="mt-1 flex gap-1">
                      <span className="rounded bg-background px-1.5 py-0.5 typography-micro text-muted-foreground">
                        {detailTask.evaluation.plan.deliverable === 'pr' ? t('board.eval.deliverable.pr') : t('board.eval.deliverable.report')}
                      </span>
                      <span className="rounded bg-background px-1.5 py-0.5 typography-micro text-muted-foreground">
                        {detailTask.evaluation.plan.review === 'green' ? t('board.eval.review.green') : t('board.eval.review.human')}
                      </span>
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="mb-1.5 typography-ui-label text-foreground">{t('board.detail.sessions')}</p>
                  {detailTask.sessionIds.length === 0 ? (
                    <p className="typography-meta text-muted-foreground/70">{t('board.detail.noSessions')}</p>
                  ) : (
                    <ul className="space-y-1">
                      {detailSessionRows(detailTask).map((row) => (
                        <li key={row.sessionId}>
                          <button
                            type="button"
                            disabled={!row.session}
                            onClick={() => openSessionFromTask(row.sessionId, row.directory)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left typography-meta hover:bg-interactive-hover disabled:cursor-default disabled:opacity-60"
                          >
                            <Icon name="chat-thread" className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-foreground">{row.title}</span>
                            {row.dateLabel ? <span className="shrink-0 typography-micro text-muted-foreground">{row.dateLabel}</span> : null}
                            {row.session ? <span className="shrink-0 typography-micro text-muted-foreground">{t('board.detail.open')}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                {detailTask.status === 'planning' && detailTask.evaluation?.status === 'done' && detailTask.evaluation.plan ? (
                  <Button
                    variant="outline"
                    size="xs"
                    className="mr-auto !font-normal"
                    onClick={() => void taskAction(detailTask.id, 'approve')}
                  >
                    {t('board.planning.approve')}
                  </Button>
                ) : null}
                <Button variant="ghost" size="xs" className="!font-normal" onClick={() => setDetailTask(null)}>
                  {t('board.detail.close')}
                </Button>
                <Button size="xs" className="!font-normal" onClick={() => { const task = detailTask; setDetailTask(null); openEditor(task); }}>
                  {t('board.detail.edit')}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={(next) => { if (!next) setSettingsOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('board.settings.title')}</DialogTitle>
          </DialogHeader>
          {settingsDraft ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block typography-ui-label text-foreground">{t('board.settings.model')}</label>
                {settingsDraft.providerId && settingsDraft.modelId ? (
                  <ModelSelector
                    providerId={settingsDraft.providerId}
                    modelId={settingsDraft.modelId}
                    onChange={(providerId, modelId) => setSettingsDraft((prev) => prev ? { ...prev, providerId, modelId } : prev)}
                  />
                ) : (
                  <p className="typography-meta text-muted-foreground">{t('board.settings.modelUnset')}</p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 typography-micro text-muted-foreground">{t('board.settings.modelHint')}</p>
                  {settingsDraft.providerId ? (
                    <button
                      type="button"
                      className="shrink-0 typography-micro text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={() => setSettingsDraft((prev) => prev ? { ...prev, providerId: '', modelId: '' } : prev)}
                    >
                      {t('board.settings.modelClear')}
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="mb-1 block typography-ui-label text-foreground">{t('board.settings.maxConcurrent')}</label>
                <Select value={String(settingsDraft.maxConcurrent)} onValueChange={(value) => setSettingsDraft((prev) => prev ? { ...prev, maxConcurrent: Number(value) || prev.maxConcurrent } : prev)}>
                  <SelectTrigger aria-label={t('board.settings.maxConcurrent')} className="w-28">
                    <SelectValue>{(value) => String(value)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block typography-ui-label text-foreground">{t('board.settings.automation')}</label>
                <Select value={settingsDraft.automationDefault} onValueChange={(value) => setSettingsDraft((prev) => prev ? { ...prev, automationDefault: value === 'auto' ? 'auto' : 'plan' } : prev)}>
                  <SelectTrigger aria-label={t('board.settings.automation')}>
                    <SelectValue>
                      {(value) => t(value === 'auto' ? 'board.settings.automation.auto' : 'board.settings.automation.plan')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plan">{t('board.settings.automation.plan')}</SelectItem>
                    <SelectItem value="auto">{t('board.settings.automation.auto')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 typography-micro text-muted-foreground">{t('board.settings.automationHint')}</p>
              </div>
              <div>
                <label className="mb-1 block typography-ui-label text-foreground">{t('board.settings.budgets')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['checkRetries', 'board.settings.checkRetries'],
                    ['mergeRetries', 'board.settings.mergeRetries'],
                    ['maxAttempts', 'board.settings.maxAttempts'],
                  ] as const).map(([field, labelKey]) => (
                    <Select key={field} value={String(settingsDraft[field])} onValueChange={(value) => setSettingsDraft((prev) => prev ? { ...prev, [field]: Number(value) || 0 } : prev)}>
                      <SelectTrigger aria-label={t(labelKey)} className="w-full">
                        <SelectValue>{(value) => String(value)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              </div>
              {mutationError ? <p className="typography-meta text-[var(--status-error)]">{mutationError}</p> : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="xs" className="!font-normal" onClick={() => setSettingsOpen(false)}>
              {t('board.dialog.cancel')}
            </Button>
            <Button
              size="xs"
              className="!font-normal"
              onClick={() => {
                if (!settingsDraft) return;
                const defaultModel = settingsDraft.providerId && settingsDraft.modelId
                  ? `${settingsDraft.providerId}/${settingsDraft.modelId}`
                  : null;
                void (async () => {
                  const ok = await updateConfig({
                    defaultModel,
                    maxConcurrent: settingsDraft.maxConcurrent,
                    automationDefault: settingsDraft.automationDefault,
                    checkRetries: settingsDraft.checkRetries,
                    mergeRetries: settingsDraft.mergeRetries,
                    maxAttempts: settingsDraft.maxAttempts,
                  });
                  if (ok) setSettingsOpen(false);
                })();
              }}
            >
              {t('board.dialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editor.open} onOpenChange={(next) => { if (!next) setEditor(closedEditor); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editor.task ? t('board.dialog.titleEdit') : t('board.dialog.titleCreate')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor="board-task-title" className="mb-1 block typography-ui-label text-foreground">
                {t('board.dialog.field.title')}
              </label>
              <Input
                id="board-task-title"
                value={editor.title}
                onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))}
                placeholder={t('board.dialog.field.titlePlaceholder')}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="board-task-description" className="mb-1 block typography-ui-label text-foreground">
                {t('board.dialog.field.description')}
              </label>
              <Textarea
                id="board-task-description"
                value={editor.description}
                onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))}
                placeholder={t('board.dialog.field.descriptionPlaceholder')}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block typography-ui-label text-foreground">{t('board.dialog.field.project')}</label>
                <Select value={editor.projectId} onValueChange={(value) => setEditor((prev) => ({ ...prev, projectId: value }))}>
                  <SelectTrigger aria-label={t('board.dialog.field.project')}>
                    <SelectValue>
                      {(value) => (value === NO_PROJECT
                        ? t('board.dialog.field.noProject')
                        : projectNames.get(String(value)) ?? String(value))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>{t('board.dialog.field.noProject')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {projectNames.get(project.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block typography-ui-label text-foreground">{t('board.dialog.field.status')}</label>
                <Select value={editor.status} onValueChange={(value) => setEditor((prev) => ({ ...prev, status: BOARD_STATUS_BY_VALUE[value] ?? prev.status }))}>
                  <SelectTrigger aria-label={t('board.dialog.field.status')}>
                    <SelectValue>
                      {(value) => {
                        const status = BOARD_STATUS_BY_VALUE[String(value)];
                        return status ? t(BOARD_STATUS_LABEL_KEYS[status]) : String(value);
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(BOARD_STATUS_LABEL_KEYS[status])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label htmlFor="board-task-labels" className="mb-1 block typography-ui-label text-foreground">
                {t('board.dialog.field.labels')}
              </label>
              <Input
                id="board-task-labels"
                value={editor.labels}
                onChange={(event) => setEditor((prev) => ({ ...prev, labels: event.target.value }))}
                placeholder={t('board.dialog.field.labelsPlaceholder')}
              />
            </div>
            {editor.task && (['queued', 'running', 'checking', 'review', 'merging'] as readonly BoardStatus[]).includes(editor.task.status) ? (
              <p className="typography-micro text-muted-foreground">
                {tFallback('board.dialog.editWillResetHint', 'Changing title or description will move this card back to Planning and restart the workflow.')}
              </p>
            ) : null}
            {mutationError ? (
              <p className="typography-meta text-[var(--status-error)]">{mutationError}</p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            {editor.task ? (
              <Button variant="ghost" size="xs" className="mr-auto !font-normal text-[var(--status-error)]" onClick={() => void handleDelete()} disabled={mutating}>
                {t('board.dialog.delete')}
              </Button>
            ) : null}
            <Button variant="outline" size="xs" className="!font-normal" onClick={() => setEditor(closedEditor)} disabled={mutating}>
              {t('board.dialog.cancel')}
            </Button>
            <Button
              size="xs"
              className="!font-normal"
              onClick={() => void handleSave()}
              disabled={mutating || !editor.title.trim()}
            >
              {editor.task ? t('board.dialog.save') : t('board.dialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDialog.open} onOpenChange={(next) => { if (!next) setReturnDialog({ open: false, task: null, note: '' }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('board.review.return')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor="board-return-note" className="mb-1 block typography-ui-label text-foreground">
              {tFallback('board.review.returnNoteLabel', 'Feedback for worker')}
            </label>
            <Textarea
              id="board-return-note"
              value={returnDialog.note}
              onChange={(event) => setReturnDialog((prev) => ({ ...prev, note: event.target.value }))}
              placeholder={tFallback('board.review.returnPlaceholder', 'Reason for return (will be sent to worker)')}
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="xs" className="!font-normal" onClick={() => setReturnDialog({ open: false, task: null, note: '' })} disabled={mutating}>
              {t('board.dialog.cancel')}
            </Button>
            <Button
              size="xs"
              className="!font-normal"
              disabled={mutating || !returnDialog.task}
              onClick={() => {
                const target = returnDialog.task;
                if (!target) return;
                const note = returnDialog.note.trim() ? returnDialog.note.trim() : null;
                void taskAction(target.id, 'return', note).then((ok) => {
                  if (ok) {
                    toast.success(tFallback('board.review.returnSuccess', 'Returned to Planning'));
                    setReturnDialog({ open: false, task: null, note: '' });
                    setDetailTask((prev) => (prev?.id === target.id ? null : prev));
                  } else {
                    toast.error(useBoardStore.getState().mutationError ?? tFallback('board.review.returnFailed', 'Failed to return task'));
                  }
                });
              }}
            >
              {t('board.review.return')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
