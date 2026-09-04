// Context compaction for builtin sessions.
//
// Strategy: keep a trailing window of whole user turns plus an LLM-written
// summary of everything before it, prepended as a system message. Budgets
// come from the model catalog limit when known, else the static default.
// Token counts are estimates (see types.estimateTokens), so thresholds are
// deliberately conservative.

import {
  AgentEventType,
  DEFAULT_COMPACTION_BUDGET_TOKENS,
  DEFAULT_COMPACTION_TRIGGER_RATIO,
  MessageContentType,
  ProviderChunkType,
  estimateTokens,
} from './types.js';

const TOOL_OUTPUT_SERIALIZE_LIMIT = 2000;
const PRESERVED_RECENT_USER_TURNS = 2;

const truncate = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length <= TOOL_OUTPUT_SERIALIZE_LIMIT ? value : `${value.slice(0, TOOL_OUTPUT_SERIALIZE_LIMIT)}\n[truncated]`;
};

// Render one stored message for the summary model. Reasoning parts are
// dropped (they are dropped from provider history too); file parts become
// placeholders.
const serializeMessage = (message) => {
  const role = message?.info?.role;
  const lines = [];
  for (const part of message?.parts || []) {
    if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
      lines.push(role === 'user' ? `[User]: ${part.text}` : `[Assistant]: ${part.text}`);
    } else if (part.type === 'file') {
      lines.push(`[Attached ${part.mime || 'file'}: ${part.filename || 'file'}]`);
    } else if (part.type === 'tool' && part.state) {
      const call = `[Assistant tool call]: ${part.tool}(${JSON.stringify(part.state.input ?? {})})`;
      if (part.state.status === 'completed') {
        lines.push(call, `[Tool result]: ${truncate(part.state.output ?? '')}`);
      } else if (part.state.status === 'error') {
        lines.push(call, `[Tool error]: ${part.state.error ?? 'unknown error'}`);
      } else {
        lines.push(call);
      }
    }
  }
  return lines.join('\n');
};

// Convert stored history into provider-agnostic unified messages. Tool
// results produced during the current turn travel as `pendingResults` (kept
// in memory, never persisted) so the UI never renders synthetic user bubbles.
const toUnifiedMessages = (messages, pendingResults) => {
  const unified = [];
  for (const message of messages) {
    if (message?.info?.role === 'user') {
      const content = [];
      for (const part of message.parts || []) {
        if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          content.push({ type: MessageContentType.TEXT, text: part.text });
        } else if (part.type === 'file') {
          content.push({ type: MessageContentType.TEXT, text: `[Attached ${part.mime || 'file'}: ${part.filename || 'file'}]` });
        }
      }
      if (content.length > 0) {
        unified.push({ role: 'user', content });
      }
    } else if (message?.info?.role === 'assistant') {
      const content = [];
      for (const part of message.parts || []) {
        if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
          content.push({ type: MessageContentType.TEXT, text: part.text });
        } else if (part.type === 'tool' && part.state && (part.state.status === 'completed' || part.state.status === 'error')) {
          let input = part.state.input;
          if (typeof input === 'string') {
            try {
              input = JSON.parse(input);
            } catch {
              input = { value: input };
            }
          }
          content.push({ type: MessageContentType.TOOL_CALL, id: part.callID || part.id, name: part.tool, input: input ?? {} });
        }
      }
      // Assistant turns with no replayable content still anchor tool-result
      // pairing, so keep the shell when a later user message references it.
      if (content.length > 0) {
        unified.push({ role: 'assistant', content });
      }
    }
  }
  if (Array.isArray(pendingResults) && pendingResults.length > 0) {
    unified.push({
      role: 'user',
      content: pendingResults.map((result) => ({
        type: MessageContentType.TOOL_RESULT,
        id: result.id,
        output: result.output,
        isError: result.isError === true,
      })),
    });
  }
  return unified;
};

export const createCompactionRuntime = ({ store, events, providers }) => {
  if (!store || !events || !providers) {
    throw new Error('createCompactionRuntime requires store, events, and providers');
  }

  const budgetFor = (contextLimit) => {
    const limit = Number.isFinite(contextLimit) && contextLimit > 0 ? contextLimit : DEFAULT_COMPACTION_BUDGET_TOKENS;
    return { limit, triggerAt: Math.floor(limit * DEFAULT_COMPACTION_TRIGGER_RATIO) };
  };

  const needsCompaction = (inputTokens, contextLimit) => {
    if (!Number.isFinite(inputTokens)) {
      return false;
    }
    return inputTokens >= budgetFor(contextLimit).triggerAt;
  };

  const buildContextMessages = (record, pendingResults) => {
    const messages = Array.isArray(record?.messages) ? record.messages : [];
    const compaction = record?.session?.compaction;
    let tail = messages;
    const preface = [];
    if (compaction && typeof compaction.summary === 'string' && compaction.summary.length > 0) {
      preface.push({
        role: 'system',
        content: [{ type: MessageContentType.TEXT, text: `[Earlier conversation summary]\n${compaction.summary}` }],
      });
      if (typeof compaction.tailStartMessageId === 'string') {
        const position = messages.findIndex((message) => message?.info?.id === compaction.tailStartMessageId);
        tail = position === -1 ? [] : messages.slice(position);
      }
    }
    return [...preface, ...toUnifiedMessages(tail, pendingResults)];
  };

  const selectHead = (messages) => {
    const userIndices = [];
    messages.forEach((message, index) => {
      if (message?.info?.role === 'user') {
        userIndices.push(index);
      }
    });
    if (userIndices.length <= PRESERVED_RECENT_USER_TURNS) {
      return { head: [], tailStartMessageId: messages[0]?.info?.id ?? null };
    }
    const tailStart = userIndices[userIndices.length - PRESERVED_RECENT_USER_TURNS];
    return { head: messages.slice(0, tailStart), tailStartMessageId: messages[tailStart]?.info?.id ?? null };
  };

  const compact = async ({ sessionID, modelRef, agent }) => {
    const record = await store.get(sessionID);
    if (!record) {
      throw new Error(`builtin session not found: ${sessionID}`);
    }
    const { head, tailStartMessageId } = selectHead(record.messages);
    if (head.length === 0) {
      return null;
    }
    const target = await providers.resolveProviderTarget(modelRef ?? record.session.model);
    const priorSummary = typeof record.session.compaction?.summary === 'string' ? record.session.compaction.summary : null;
    const conversation = head.map(serializeMessage).filter((text) => text.length > 0).join('\n\n');
    const prompt = [
      'Summarize this coding-assistant conversation for continuation.',
      'Keep: user goals, key decisions, files changed, pending work, error context.',
      'Drop: verbatim tool outputs, greetings, restated code.',
      priorSummary ? `Previous summary:\n${priorSummary}` : null,
      `Conversation:\n${conversation}`,
    ].filter(Boolean).join('\n\n');

    let summary = '';
    const stream = providers.streamProvider(target, {
      messages: [{ role: 'user', content: [{ type: MessageContentType.TEXT, text: prompt }] }],
      tools: [],
      signal: undefined,
      sessionID,
    });
    for await (const chunk of stream) {
      if (chunk?.type === ProviderChunkType.TEXT_DELTA && typeof chunk.text === 'string') {
        summary += chunk.text;
      }
    }
    summary = summary.trim();
    if (!summary) {
      throw new Error('compaction produced an empty summary');
    }
    await store.updateSession(sessionID, {
      compaction: { summary, tailStartMessageId, time: { created: Date.now() } },
    });
    events.publish(AgentEventType.SESSION_COMPACTED, { sessionID }, record.session.directory);
    const updated = await store.get(sessionID);
    events.publish(
      AgentEventType.SESSION_UPDATED,
      { sessionID, info: updated ? updated.session : record.session },
      record.session.directory,
    );
    return summary;
  };

  return {
    budgetFor,
    needsCompaction,
    buildContextMessages,
    compact,
    estimateTokens,
  };
};
