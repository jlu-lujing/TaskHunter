/**
 * Timeline rows for the message roles that are not a conversation turn.
 *
 * OpenCode v2 promoted things that used to hide inside a user message — a
 * compaction, a shell command, injected context — to message roles of their
 * own. Only `user` and `assistant` carry parts, so the roles that have
 * something to show render here as small, self-contained rows instead of
 * going through `ChatMessage`.
 */

import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { ReasoningTimelineBlock } from './parts/ReasoningPart';
import ToolPart from './parts/ToolPart';
import { OPENCODE_TOOLS } from '@/lib/opencode/tools';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import type { Message, ToolPart as ToolPartType } from '@/lib/opencode/model';
import { cn } from '@/lib/utils';

/** The shared frame every notice row sits in, so they line up with messages. */
const NoticeRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="w-full pb-2">
        <div className="chat-column">{children}</div>
    </div>
);

const CompactionNotice: React.FC<{ message: Extract<Message, { role: 'compaction' }> }> = ({ message }) => {
    const { t } = useI18n();
    const running = message.status === 'running';
    const failed = message.status === 'failed';
    const summary = message.summary.trim();

    // A compaction reads like a thinking row: one collapsible tool-style line
    // whose body is the summary as Markdown. The summary streams in while the
    // compaction runs, so the body is open and follows its end until it settles.
    return (
        <NoticeRow>
            <ReasoningTimelineBlock
                text={summary}
                variant="thinking"
                blockId={message.id}
                isStreaming={running}
                presentation={{
                    icon: failed ? 'error-warning' : 'scissors',
                    iconClassName: failed ? 'text-[var(--status-error)]' : undefined,
                    title: running
                        ? t('chat.compaction.running')
                        : failed
                            ? t('chat.compaction.failed')
                            : t('chat.compaction.completed'),
                    expandLabel: t('chat.compaction.showSummary'),
                    collapseLabel: t('chat.compaction.hideSummary'),
                    markdownVariant: 'assistant',
                    maxHeightClassName: 'max-h-[60vh]',
                }}
            />
            {!running && !summary ? (
                <div className="flex items-center gap-1.5 py-1.5 pl-px typography-meta" style={{ color: 'var(--tools-title)' }}>
                    <Icon
                        name={failed ? 'error-warning' : 'scissors'}
                        className={cn('h-3.5 w-3.5 shrink-0', failed && 'text-[var(--status-error)]')}
                        style={failed ? undefined : { color: 'var(--tools-icon)' }}
                    />
                    <span className="font-medium">{failed ? t('chat.compaction.failed') : t('chat.compaction.completed')}</span>
                </div>
            ) : null}
            {message.error ? (
                <div className="pl-5 typography-meta text-[var(--status-error)] break-words">{message.error.message}</div>
            ) : null}
        </NoticeRow>
    );
};

/**
 * A `!command` run is shown as the shell tool the agent would have called, so
 * both read the same: the tool row renders it from a synthesized tool part.
 */
const toShellToolPart = (message: Extract<Message, { role: 'shell' }>): ToolPartType => {
    const input = { command: message.command };
    const start = message.time.created;
    const end = message.time.completed ?? start;
    const output = message.output?.output ?? '';
    const failed = message.status === 'killed' || message.status === 'timeout' || (message.exit !== undefined && message.exit !== 0);
    const base = {
        id: `${message.id}:shell`,
        sessionID: message.sessionID,
        messageID: message.id,
        type: 'tool' as const,
        callID: message.shellID,
        tool: OPENCODE_TOOLS.shell,
    };
    if (message.status === 'running') {
        return { ...base, state: { status: 'running', input, metadata: { output }, time: { start } } };
    }
    if (failed) {
        const reason = message.exit !== undefined ? `${message.status} (${message.exit})` : message.status;
        return { ...base, state: { status: 'error', input, error: reason, output, time: { start, end } } };
    }
    return { ...base, state: { status: 'completed', input, output, time: { start, end } } };
};

const ShellNotice: React.FC<{ message: Extract<Message, { role: 'shell' }> }> = ({ message }) => {
    const isMobile = useUIStore((state) => state.isMobile);
    const [expanded, setExpanded] = React.useState(false);
    const part = React.useMemo(() => toShellToolPart(message), [message]);
    const toggle = React.useCallback(() => setExpanded((value) => !value), []);

    return (
        <NoticeRow>
            <ToolPart part={part} isExpanded={expanded} onToggle={toggle} isMobile={isMobile} />
        </NoticeRow>
    );
};

/**
 * The timeline row for a message, or `null` when the caller should render the
 * message itself.
 */
export const TimelineNotice: React.FC<{ message: Message }> = ({ message }) => {
    switch (message.role) {
        case 'compaction':
            return <CompactionNotice message={message} />;
        case 'shell':
            return <ShellNotice message={message} />;
        default:
            return null;
    }
};
