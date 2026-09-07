// Shared session-shape projection for builtin sessions.
//
// Lives apart from routes.js so HTTP marshalling and server-side dispatch
// (dispatch.js) project the same record shape into the OpenCode-compatible
// session info the UI and server consumers read. Session payloads never
// expose the stashed revert tail: it can hold full tool outputs and has no
// UI reader.

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export const toSessionInfo = (session) => {
  if (!isRecord(session)) {
    return session;
  }
  const { revertedTail, ...info } = session;
  return info;
};
