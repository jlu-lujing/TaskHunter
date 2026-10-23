import React from 'react';

import { cancelWhenLayoutSettled, runWhenLayoutSettled } from '@/lib/layoutAnimation';

/**
 * Whether a side column's content still counts as shown: true at once when it
 * opens, and through its closing animation (`lib/layoutAnimation.ts`) until
 * that ends. Call it after the layout effect that begins the animation, so a
 * toggle's animation is already running when this hook queues behind it.
 */
export const useOpenUntilSettled = (isOpen: boolean): boolean => {
  const isOpenRef = React.useRef(isOpen);
  isOpenRef.current = isOpen;
  const [settledOpen, setSettledOpen] = React.useState(isOpen);
  const settle = React.useCallback(() => setSettledOpen(isOpenRef.current), []);
  React.useLayoutEffect(() => {
    runWhenLayoutSettled(settle);
  }, [isOpen, settle]);
  React.useEffect(() => () => cancelWhenLayoutSettled(settle), [settle]);
  return isOpen || settledOpen;
};
