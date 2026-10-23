// A reading position in the chat timeline, expressed as the message at the
// top of the viewport and how far its top sits from the viewport's top edge.
// Pixel offsets alone do not survive a remount: rows above re-measure, the
// window of loaded history changes, and virtualized rows mount in a different
// order. A message identity does.
export interface MessageViewportAnchor {
    readonly messageId: string;
    readonly offsetTop: number;
}

export type ViewportAnchorAlignment = 'missing' | 'moved' | 'aligned';

// Anchor hold for an explicit viewport restore (navigation, session re-entry):
// row measurements settle over several frames, so a single restore can be
// invalidated by the next measurement pass. Re-assert until it holds still for
// STABLE_FRAMES consecutive frames, giving up at MAX_FRAMES.
export const ANCHOR_HOLD_STABLE_FRAMES = 30;
export const ANCHOR_HOLD_MAX_FRAMES = 180;

// The topmost message still visible in the container. Virtualized rows are
// not in visual order in the DOM (a row mounted while scrolling up is appended
// after the rows below it), so every mounted message is compared by position.
export const captureMessageViewportAnchor = (container: HTMLElement): MessageViewportAnchor | null => {
    const containerTop = container.getBoundingClientRect().top;
    let best: { node: HTMLElement; top: number } | null = null;

    for (const node of container.querySelectorAll<HTMLElement>('[data-message-id]')) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom <= containerTop + 1) continue;
        if (best && rect.top >= best.top) continue;
        best = { node, top: rect.top };
    }

    const messageId = best?.node.dataset.messageId;
    if (!best || !messageId) return null;
    return { messageId, offsetTop: best.top - containerTop };
};
