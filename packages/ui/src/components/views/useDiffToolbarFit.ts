import React from 'react';

/**
 * Collapses the diff toolbar's labels to icons only when the row does not fit.
 *
 * The steps are attributes set on the toolbar in order, each hiding more (the
 * CSS is in `index.css`): first the walkthrough label, then the review and
 * expand labels and the scope count. A step is taken only while the row
 * overflows or one of its texts that may truncate (`.truncate`, the base and
 * commit pickers) is cut off, so labels go before a branch name is clipped.
 *
 * CSS container breakpoints cannot do this: the row's content changes with the
 * scope (a base picker, a pull request picker, a count) and with the language,
 * so a fixed width either hides labels that fit or lets the row overflow and
 * the icons at its end overlap.
 *
 * Measuring forces a layout, so after a render it runs only when the row
 * mounted or its text changed; a resize or a web font loading refits through
 * the listeners.
 */
const DIFF_TOOLBAR_FIT_STEPS = ['data-diff-toolbar-compact-walkthrough', 'data-diff-toolbar-compact'] as const;

export const useDiffToolbarFit = (ref: React.RefObject<HTMLElement | null>): void => {
  // The row last fitted and its text and child count then; reading these forces no layout.
  const fittedRef = React.useRef<{ container: HTMLElement; signature: string } | null>(null);
  const observedRef = React.useRef<{ container: HTMLElement; release: () => void } | null>(null);

  React.useLayoutEffect(() => {
    const container = ref.current;
    if (observedRef.current?.container !== container) {
      observedRef.current?.release();
      observedRef.current = container ? { container, release: observeResizes(container) } : null;
    }
    if (!container) return;
    const signature = `${container.childElementCount}\0${container.textContent ?? ''}`;
    const fitted = fittedRef.current;
    if (fitted?.container === container && fitted.signature === signature) return;
    fittedRef.current = { container, signature };
    fitToolbar(container);
  });

  React.useEffect(() => () => {
    observedRef.current?.release();
    observedRef.current = null;
  }, []);
};

const fits = (container: HTMLElement): boolean => {
  if (container.scrollWidth > container.clientWidth + 1) return false;
  for (const text of container.querySelectorAll<HTMLElement>('.truncate')) {
    if (text.scrollWidth > text.clientWidth + 1) return false;
  }
  return true;
};

export const fitToolbar = (container: HTMLElement): void => {
  for (const step of DIFF_TOOLBAR_FIT_STEPS) container.removeAttribute(step);
  for (const step of DIFF_TOOLBAR_FIT_STEPS) {
    if (fits(container)) return;
    container.setAttribute(step, '');
  }
};

const observeResizes = (container: HTMLElement): (() => void) => {
  let inCallback = false;
  const refit = () => {
    // Hiding a label never resizes the toolbar (its width comes from the
    // header around it), but guard the re-entry anyway.
    if (inCallback) return;
    inCallback = true;
    fitToolbar(container);
    inCallback = false;
  };
  const fonts = globalThis.document?.fonts ?? null;
  fonts?.addEventListener('loadingdone', refit);
  const observer = new ResizeObserver(refit);
  observer.observe(container);
  return () => {
    fonts?.removeEventListener('loadingdone', refit);
    observer.disconnect();
  };
};
