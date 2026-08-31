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
import { PROJECT_COLOR_MAP } from '@/lib/projectMeta';
import { useI18n } from '@/lib/i18n';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveGlobalSessionDirectory } from '@/stores/globalSessionStructure';
import { formatSessionDateLabel } from '@/components/session/sidebar/utils';
import type { Session } from '@opencode-ai/sdk/v2';
import { useBoardStore, type BoardCreateInput } from '@/stores/useBoardStore';
import { startBoardTaskSession } from '@/lib/boardStartSession';
import {
  BOARD_STATUSES,
  BOARD_STATUS_BY_VALUE,
  BOARD_STATUS_LABEL_KEYS,
  filterTasksByProject,
  groupTasksByStatus,
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
  const mutating = useBoardStore((state) => state.mutating);
  const mutationError = useBoardStore((state) => state.mutationError);

  const [filterProjectId, setFilterProjectId] = React.useState<string>(ALL_PROJECTS);
  const [editor, setEditor] = React.useState<EditorState>(closedEditor);
  const [detailTask, setDetailTask] = React.useState<BoardTask | null>(null);
  const sessionsByDirectory = useGlobalSessionsStore((state) => state.sessionsByDirectory);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const projectNames = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project.label ?? project.path.split('/').filter(Boolean).pop() ?? project.id])),
    [projects],
  );
  const projectColors = React.useMemo(
    () => new Map(projects.map((project) => [project.id, project.color ? PROJECT_COLOR_MAP[project.color] ?? null : null])),
    [projects],
  );

  if (!open) return null;

  const visibleTasks = filterTasksByProject(
    tasks,
    filterProjectId === ALL_PROJECTS ? null : filterProjectId,
  );
  const grouped = groupTasksByStatus(visibleTasks);

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

  const sessions = React.useMemo(
    () => Array.from(sessionsByDirectory.values()).flat(),
    [sessionsByDirectory],
  );

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

  const handleSave = async () => {
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

  const renderCard = (task: BoardTask) => {
    const forward = nextStatus(task.status);
    const backward = previousStatus(task.status);
    const canClaim = Boolean(task.projectId) && task.status !== 'done';
    const projectName = task.projectId ? projectNames.get(task.projectId) ?? task.projectId : null;
    const projectColor = task.projectId ? projectColors.get(task.projectId) : null;
    return (
      <div
        key={task.id}
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
      >
        <p className="typography-ui-label line-clamp-2 text-foreground">{task.title}</p>
        {task.description ? (
          <p className="mt-1 line-clamp-2 typography-meta text-muted-foreground">{task.description}</p>
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
          {canClaim ? (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
              aria-label={t('board.claim.action')}
              title={t('board.claim.action')}
              onClick={(event) => {
                event.stopPropagation();
                void startBoardTaskSession({ task, t });
              }}
            >
              <Icon name="play" className="size-3.5" />
            </button>
          ) : null}
          <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100">
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
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex items-center gap-2 px-6 pt-4">
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t('board.back')}>
          <Icon name="arrow-left" className="size-4" />
        </Button>
        <h1 className="typography-ui-header text-foreground">{t('board.title')}</h1>
        <div className="ml-2 w-40">
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
        <div className="ml-auto">
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
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
          <div className="grid h-full min-w-full auto-cols-[minmax(240px,1fr)] grid-rows-1 gap-3" style={{ gridTemplateColumns: `repeat(${BOARD_STATUSES.length}, minmax(240px, 1fr))` }}>
            {BOARD_STATUSES.map((status) => (
              <div key={status} className="flex min-h-0 flex-col rounded-xl bg-muted/40 p-2">
                <div className="flex items-center gap-1.5 px-1 pb-2 typography-ui-label text-muted-foreground">
                  {status === 'done' ? <Icon name="check" className="size-3.5" /> : null}
                  <span>{t(BOARD_STATUS_LABEL_KEYS[status])}</span>
                  <span className="typography-micro">{grouped.get(status)?.length ?? 0}</span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {(grouped.get(status) ?? []).map(renderCard)}
                  {(grouped.get(status)?.length ?? 0) === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 px-2 py-3 text-center typography-meta text-muted-foreground/70">
                      {t('board.column.empty')}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
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
                </div>
                {detailTask.description ? (
                  <p className="whitespace-pre-wrap typography-meta text-muted-foreground">{detailTask.description}</p>
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
                {detailTask.projectId && detailTask.status !== 'done' ? (
                  <Button
                    variant="outline"
                    size="xs"
                    className="mr-auto !font-normal"
                    onClick={() => void startBoardTaskSession({ task: detailTask, t })}
                  >
                    {t('board.claim.action')}
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
    </div>
  );
}
