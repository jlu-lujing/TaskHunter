import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { captureMessageViewportAnchor } from './messageViewportAnchor';

type Box = { top: number; height: number };

const originalGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    DOMRect: globalThis.DOMRect,
};

const placeAt = (element: HTMLElement, box: Box) => {
    element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: box.top, width: 100, height: box.height });
};

const createTimeline = () => {
    const container = document.createElement('div');
    document.body.append(container);
    placeAt(container, { top: 100, height: 600 });
    const addMessage = (messageId: string, box: Box) => {
        const node = document.createElement('div');
        node.dataset.messageId = messageId;
        placeAt(node, box);
        container.append(node);
        return node;
    };
    return { container, addMessage };
};

describe('captureMessageViewportAnchor', () => {
    beforeEach(() => {
        const windowInstance = new Window();
        Object.assign(globalThis, {
            window: windowInstance,
            document: windowInstance.document,
            DOMRect: windowInstance.DOMRect,
        });
    });

    afterEach(() => {
        Object.assign(globalThis, originalGlobals);
    });

    test('picks the topmost visible message even when the DOM order differs', () => {
        const { container, addMessage } = createTimeline();
        // A row mounted while scrolling up is appended after the rows below it.
        addMessage('below', { top: 400, height: 200 });
        addMessage('above-edge', { top: 40, height: 200 });
        addMessage('offscreen', { top: -500, height: 300 });

        expect(captureMessageViewportAnchor(container)).toEqual({ messageId: 'above-edge', offsetTop: -60 });
    });

    test('returns null when no message is visible', () => {
        const { container, addMessage } = createTimeline();
        addMessage('gone', { top: -300, height: 200 });

        expect(captureMessageViewportAnchor(container)).toBeNull();
    });
});
