// Agent turn loop for builtin sessions.
//
// One runTurn() call drives a full turn: stream provider chunks, persist
// message/part records, gate tool calls through the permission registry,
// execute tools, feed results back, repeat until the provider stops. All UI
// and server consumers observe the turn through OpenCode-shaped events only.
//
// Persistence strategy: message shells and completed content hit the store;
// per-delta text accumulates in memory and persists at step boundaries. A
// crash mid-step leaves an unfinished assistant message, which the UI
// already renders as interrupted (same contract as a killed OpenCode
// process).

import {
  AgentEventType,
  FinishReason,
  MessageContentType,
  PartType,
  ProviderChunkType,
  SessionStatusType,
  ToolStateStatus,
  createMessageId,
  createPartId,
} from './types.js';

// Guardrail against runaway provider loops. Compaction keeps legitimate long
// sessions alive; this only catches pathological tool-call cycles.
const MAX_LOOP_STEPS = 50;
const TITLE_MAX_CHARS = 60;

const isAbortError = (error) => error?.name === 'AbortError' || error?.name === 'PermissionAbortedError';

export const createAgentLoop = ({ store, events, permissions, providers, tools, compaction }) => {
  if (!store || !events || !permissions || !providers || !compaction) {
    throw new Error('createAgentLoop requires store, events, permissions, providers, and compaction');
  }
  const toolMap = new Map((tools?.definitions || []).map((tool) => [tool.name, tool]));
  const toolDefs = (tools?.definitions || []).map(({ name, description, parameters }) => ({ name, description, parameters }));
  const executeTool = tools?.execute || (async () => ({ output: 'Error: tool runtime unavailable', isError: true }));

  const emit = (type, properties, directory) => events.publish(type, properties, directory);

  const setStatus = (sessionID, directory, type) => emit(
    AgentEventType.SESSION_STATUS,
    { sessionID, status: { type } },
    directory,
  );

  const buildSystemText = (directory) => [
    `You are a coding assistant operating in ${directory}.`,
    `Current date: ${new Date().toISOString().slice(0, 10)}.`,
    'Use the available tools to complete the task, then respond with a concise summary of what you did.',
  ].join('\n');

  const blankTokens = () => ({ input: 0, output: 0, reasoning: 0 });

  const failTurn = async ({ session, message, errorName, errorMessage, publishErrorEvent }) => {
    message.info.error = { name: errorName, message: errorMessage };
    message.info.finish = 'error';
    if (!message.info.time.completed) {
      message.info.time.completed = Date.now();
    }
    await store.updateMessage(session.id, message);
    emit(AgentEventType.MESSAGE_UPDATED, { sessionID: session.id, info: message.info }, session.directory);
    if (publishErrorEvent) {
      emit(AgentEventType.SESSION_ERROR, { sessionID: session.id, error: { name: errorName, message: errorMessage } }, session.directory);
    }
    setStatus(session.id, session.directory, SessionStatusType.IDLE);
    emit(AgentEventType.SESSION_IDLE, { sessionID: session.id }, session.directory);
  };

  const finishTurn = async ({ session, message }) => {
    if (!message.info.time.completed) {
      message.info.time.completed = Date.now();
    }
    await store.updateMessage(session.id, message);
    emit(AgentEventType.MESSAGE_UPDATED, { sessionID: session.id, info: message.info }, session.directory);
    const updated = await store.get(session.id);
    const info = updated ? updated.session : session;
    emit(AgentEventType.SESSION_UPDATED, { sessionID: session.id, info }, session.directory);
    setStatus(session.id, session.directory, SessionStatusType.IDLE);
    emit(AgentEventType.SESSION_IDLE, { sessionID: session.id }, session.directory);
  };

  const ensureTitle = async (session, firstUserText) => {
    if (session.title !== 'New session' || typeof firstUserText !== 'string' || firstUserText.length === 0) {
      return;
    }
    const title = firstUserText.trim().split('\n')[0].slice(0, TITLE_MAX_CHARS).trim() || 'New session';
    await store.updateSession(session.id, { title });
  };

  const runTurn = async ({ sessionID, modelRef, agent, signal }) => {
    const record = await store.get(sessionID);
    if (!record) {
      throw new Error(`builtin session not found: ${sessionID}`);
    }
    let session = record.session;
    const directory = session.directory;

    let target;
    try {
      target = await providers.resolveProviderTarget(modelRef ?? session.model);
    } catch (error) {
      const shell = await store.appendMessage(sessionID, {
        role: 'assistant', agent: agent ?? session.agent, model: session.model,
        tokens: blankTokens(), cost: 0, time: { created: Date.now() },
      }, []);
      await failTurn({
        session, message: shell, errorName: 'ProviderError', errorMessage: error?.message ?? String(error), publishErrorEvent: true,
      });
      return { status: 'error' };
    }
    if (modelRef && (modelRef.providerID !== session.model.providerID || modelRef.modelID !== session.model.modelID)) {
      session = await store.updateSession(sessionID, { model: { providerID: modelRef.providerID, modelID: modelRef.modelID } });
    }

    setStatus(sessionID, directory, SessionStatusType.BUSY);
    let pendingResults = [];
    let compactedThisTurn = false;

    try {
      for (let step = 0; step < MAX_LOOP_STEPS; step += 1) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const current = await store.get(sessionID);
        if (!current) {
          throw new Error(`builtin session disappeared mid-turn: ${sessionID}`);
        }
        const contextMessages = compaction.buildContextMessages(current, pendingResults);
        pendingResults = [];
        const messages = [
          { role: 'system', content: [{ type: MessageContentType.TEXT, text: buildSystemText(directory) }] },
          ...contextMessages,
        ];

        const assistant = await store.appendMessage(sessionID, {
          role: 'assistant', agent: agent ?? session.agent,
          model: { providerID: (modelRef ?? session.model).providerID, modelID: target.apiModelID },
          tokens: blankTokens(), cost: 0, time: { created: Date.now() },
        }, []);
        emit(AgentEventType.MESSAGE_UPDATED, { sessionID, info: assistant.info }, directory);

        const outcome = await runStep({ session, message: assistant, messages, target, agent: agent ?? session.agent, signal, directory });
        session = (await store.get(sessionID))?.session ?? session;
        // Attribute step usage to the session totals (single writer per
        // turn, so read-modify-write here cannot race).
        const stepInput = Number.isFinite(outcome.usageInput) ? outcome.usageInput : 0;
        const stepOutput = Number.isFinite(outcome.usageOutput) ? outcome.usageOutput : 0;
        if (stepInput > 0 || stepOutput > 0) {
          const base = session.tokens && Number.isFinite(session.tokens.input) && Number.isFinite(session.tokens.output)
            ? session.tokens
            : blankTokens();
          session = await store.updateSession(sessionID, {
            tokens: { input: base.input + stepInput, output: base.output + stepOutput, reasoning: base.reasoning || 0 },
          });
        }

        if (outcome.action === 'abort') {
          await failTurn({
            session, message: outcome.message, errorName: 'MessageAbortedError', errorMessage: 'Turn aborted', publishErrorEvent: false,
          });
          // Aborts settle quietly to idle without a session.error: the UI
          // already renders the aborted message state.
          return { status: 'aborted' };
        }
        if (outcome.action === 'blocked') {
          await failTurn({
            session, message: outcome.message, errorName: 'PermissionRejectedError', errorMessage: 'Tool permission rejected', publishErrorEvent: true,
          });
          return { status: 'blocked' };
        }
        if (outcome.action === 'error') {
          await failTurn({
            session, message: outcome.message, errorName: outcome.errorName, errorMessage: outcome.errorMessage, publishErrorEvent: true,
          });
          return { status: 'error' };
        }
        pendingResults = outcome.pendingResults;
        if (outcome.finish === FinishReason.STOP) {
          const firstUserText = current.messages.find((message) => message?.info?.role === 'user')
            ?.parts?.find((part) => part.type === 'text')?.text;
          await ensureTitle(session, firstUserText);
          await finishTurn({ session, message: outcome.message });
          return { status: 'done' };
        }
        if (outcome.finish === FinishReason.LENGTH || compaction.needsCompaction(outcome.usageInput, target.contextLimit)) {
          if (!compactedThisTurn) {
            compactedThisTurn = true;
            try {
              await compaction.compact({ sessionID, modelRef: modelRef ?? session.model, agent: agent ?? session.agent });
              session = (await store.get(sessionID))?.session ?? session;
            } catch (error) {
              await failTurn({
                session, message: outcome.message, errorName: 'CompactionError', errorMessage: error?.message ?? String(error), publishErrorEvent: true,
              });
              return { status: 'error' };
            }
          }
        }
        // TOOL_CALLS (or post-compaction LENGTH): continue with results.
      }
      const tail = await store.get(sessionID);
      const lastAssistant = tail ? [...tail.messages].reverse().find((message) => message?.info?.role === 'assistant') : null;
      if (lastAssistant) {
        await failTurn({
          session: tail.session, message: lastAssistant, errorName: 'MaxStepsError', errorMessage: `Turn exceeded ${MAX_LOOP_STEPS} steps`, publishErrorEvent: true,
        });
      }
      return { status: 'error' };
    } catch (error) {
      if (isAbortError(error)) {
        try {
          await permissions.cancelSession(sessionID);
        } catch {
        }
        const tail = await store.get(sessionID).catch(() => null);
        const lastAssistant = tail ? [...tail.messages].reverse().find((message) => message?.info?.role === 'assistant' && !message?.info?.time?.completed) : null;
        if (tail && lastAssistant) {
          await failTurn({
            session: tail.session, message: lastAssistant, errorName: 'MessageAbortedError', errorMessage: 'Turn aborted', publishErrorEvent: false,
          });
        } else if (tail) {
          setStatus(sessionID, directory, SessionStatusType.IDLE);
          emit(AgentEventType.SESSION_IDLE, { sessionID }, directory);
        }
        return { status: 'aborted' };
      }
      const tail = await store.get(sessionID).catch(() => null);
      const lastAssistant = tail ? [...tail.messages].reverse().find((message) => message?.info?.role === 'assistant' && !message?.info?.time?.completed) : null;
      if (tail && lastAssistant) {
        await failTurn({
          session: tail.session, message: lastAssistant, errorName: 'TurnError', errorMessage: error?.message ?? String(error), publishErrorEvent: true,
        });
      }
      return { status: 'error' };
    }
  };

  const runStep = async ({ session, message, messages, target, agent, signal, directory }) => {
    let textPart = null;
    let reasoningPart = null;
    const toolInputs = new Map();
    const toolParts = new Map();
    let usageInput = 0;
    let usageOutput = 0;

    const persistMessage = async () => {
      await store.updateMessage(session.id, message);
    };

    // Mirrors the upstream text-start/text-delta sequence: an empty part
    // announces the part, every fragment (including the first) arrives as a
    // delta. The UI coalesces deltas onto the announced part.
    const upsertTextPart = async (kind, text) => {
      let current = kind === 'text' ? textPart : reasoningPart;
      if (!current) {
        current = {
          id: createPartId(), sessionID: session.id, messageID: message.info.id,
          type: kind, text: '', time: { start: Date.now() },
        };
        message.parts.push(current);
        if (kind === 'text') {
          textPart = current;
        } else {
          reasoningPart = current;
        }
        emit(AgentEventType.MESSAGE_PART_UPDATED, { sessionID: session.id, part: current, time: Date.now() }, directory);
      }
      current.text += text;
      emit(AgentEventType.MESSAGE_PART_DELTA, {
        sessionID: session.id, messageID: message.info.id, partID: current.id, field: 'text', delta: text,
      }, directory);
      return current;
    };

    const finalizeTextParts = async () => {
      const now = Date.now();
      for (const part of [textPart, reasoningPart]) {
        if (part && !part.time.end) {
          part.time.end = now;
        }
      }
      if (textPart || reasoningPart) {
        await persistMessage();
        for (const part of [textPart, reasoningPart]) {
          if (part) {
            emit(AgentEventType.MESSAGE_PART_UPDATED, { sessionID: session.id, part, time: Date.now() }, directory);
          }
        }
      }
    };

    const completeToolPart = async (callID, state) => {
      const part = toolParts.get(callID);
      if (!part) {
        return null;
      }
      part.state = { ...part.state, ...state, time: { ...part.state.time, end: Date.now() } };
      await persistMessage();
      emit(AgentEventType.MESSAGE_PART_UPDATED, { sessionID: session.id, part, time: Date.now() }, directory);
      return part;
    };

    try {
      const stream = providers.streamProvider(target, { messages, tools: toolDefs, signal, sessionID: session.id });
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        switch (chunk?.type) {
          case ProviderChunkType.TEXT_DELTA: {
            if (typeof chunk.text === 'string' && chunk.text.length > 0) {
              await upsertTextPart(PartType.TEXT, chunk.text);
            }
            break;
          }
          case ProviderChunkType.REASONING_DELTA: {
            if (typeof chunk.text === 'string' && chunk.text.length > 0) {
              await upsertTextPart(PartType.REASONING, chunk.text);
            }
            break;
          }
          case ProviderChunkType.TOOL_START: {
            const part = {
              id: createPartId(), sessionID: session.id, messageID: message.info.id,
              type: PartType.TOOL, tool: chunk.name || 'unknown', callID: chunk.id,
              state: { status: ToolStateStatus.RUNNING, input: {}, time: { start: Date.now() } },
            };
            message.parts.push(part);
            toolParts.set(chunk.id, part);
            toolInputs.set(chunk.id, '');
            await persistMessage();
            emit(AgentEventType.MESSAGE_PART_UPDATED, { sessionID: session.id, part, time: Date.now() }, directory);
            break;
          }
          case ProviderChunkType.TOOL_INPUT_DELTA: {
            if (toolInputs.has(chunk.id) && typeof chunk.text === 'string') {
              toolInputs.set(chunk.id, toolInputs.get(chunk.id) + chunk.text);
            }
            break;
          }
          case ProviderChunkType.TOOL_END: {
            break;
          }
          case ProviderChunkType.DONE: {
            break;
          }
          default: {
            break;
          }
        }
        if (chunk?.type === ProviderChunkType.DONE) {
          // Drain: usage arrives with done; fall out of the stream loop.
          usageInput = Number.isFinite(chunk.usage?.input) ? chunk.usage.input : usageInput;
          usageOutput = Number.isFinite(chunk.usage?.output) ? chunk.usage.output : usageOutput;
          await finalizeTextParts();
          message.info.tokens.input += usageInput;
          message.info.tokens.output += usageOutput;
          const result = await completeStep({ session, message, target, agent, signal, directory, toolParts, toolInputs, finish: chunk.finish, persistMessage, completeToolPart });
          return { ...result, usageInput, usageOutput };
        }
      }
      // Stream ended without an explicit done (defensive; adapters always
      // emit done, so reaching here means transport truncation).
      await finalizeTextParts();
      return {
        action: 'error', message, errorName: 'TruncatedStreamError', errorMessage: 'Provider stream ended without completion', pendingResults: [],
        usageInput, usageOutput,
      };
    } catch (error) {
      if (isAbortError(error)) {
        await finalizeTextParts().catch(() => {});
        return { action: 'abort', message, pendingResults: [] };
      }
      throw error;
    }
  };

  const completeStep = async ({ session, message, target, agent, signal, directory, toolParts, toolInputs, finish, persistMessage, completeToolPart }) => {
    // No tool calls and a stop finish: plain response turn end.
    if (toolParts.size === 0) {
      if (finish === FinishReason.CONTENT_FILTER) {
        return { action: 'error', message, errorName: 'ContentFilterError', errorMessage: 'The response was blocked by the provider content filter', pendingResults: [] };
      }
      message.info.finish = 'stop';
      await persistMessage();
      emit(AgentEventType.MESSAGE_UPDATED, { sessionID: session.id, info: message.info }, directory);
      return { action: 'continue', message, finish: FinishReason.STOP, pendingResults: [], usageInput: 0 };
    }

    // Execute every completed tool call sequentially, gating each through
    // permissions first. Results feed the next loop step.
    const pendingResults = [];
    for (const [callID, part] of toolParts) {
      if (signal?.aborted) {
        return { action: 'abort', message, pendingResults: [] };
      }
      let input = {};
      const raw = toolInputs.get(callID) || '';
      if (raw.trim().length > 0) {
        try {
          input = JSON.parse(raw);
        } catch {
          await completeToolPart(callID, { status: ToolStateStatus.ERROR, error: `Tool input is not valid JSON: ${raw.slice(0, 200)}`, input: { value: raw } });
          pendingResults.push({ id: callID, output: `Error: ${part.tool} received malformed JSON input`, isError: true });
          continue;
        }
      }
      part.state.input = input;
      await persistMessage();

      let permission;
      try {
        permission = await permissions.ask({
          sessionID: session.id, directory, permission: part.tool, patterns: [part.tool], signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          return { action: 'abort', message, pendingResults: [] };
        }
        await completeToolPart(callID, { status: ToolStateStatus.ERROR, error: 'Permission rejected', input });
        return { action: 'blocked', message, pendingResults: [] };
      }
      if (permission !== 'once' && permission !== 'always') {
        await completeToolPart(callID, { status: ToolStateStatus.ERROR, error: 'Permission rejected', input });
        return { action: 'blocked', message, pendingResults: [] };
      }

      const definition = toolMap.get(part.tool);
      if (!definition) {
        await completeToolPart(callID, { status: ToolStateStatus.ERROR, error: `Unknown tool: ${part.tool}`, input });
        pendingResults.push({ id: callID, output: `Error: unknown tool ${part.tool}`, isError: true });
        continue;
      }
      let result;
      try {
        result = await executeTool(part.tool, input, { sessionID: session.id, directory, agent, signal });
      } catch (error) {
        result = { output: `Error: ${error?.message ?? String(error)}`, isError: true };
      }
      const output = typeof result?.output === 'string' ? result.output : JSON.stringify(result ?? '');
      await completeToolPart(callID, {
        status: result?.isError ? ToolStateStatus.ERROR : ToolStateStatus.COMPLETED,
        ...(result?.isError ? { error: output } : { output }),
        ...(typeof result?.title === 'string' ? { title: result.title } : {}),
        input,
      });
      pendingResults.push({ id: callID, output, isError: result?.isError === true });
    }

    message.info.finish = 'tool-calls';
    await persistMessage();
    emit(AgentEventType.MESSAGE_UPDATED, { sessionID: session.id, info: message.info }, directory);
    return { action: 'continue', message, finish: FinishReason.TOOL_CALLS, pendingResults, usageInput: 0 };
  };

  return {
    runTurn,
  };
};
