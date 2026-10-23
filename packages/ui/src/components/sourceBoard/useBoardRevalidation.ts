import * as React from 'react';

import { revalidateReferences } from '@/components/references/referenceCache';

/**
 * Keeps the board's lists and preview current. The desktop board stays
 * mounted while closed, so without this it shows what it read when a list was
 * first shown. While the board is on screen, anything read more than a minute
 * ago is read again when it opens and when the user comes back to the window.
 */
export function useBoardRevalidation(onScreen: boolean): void {
    React.useEffect(() => {
        if (!onScreen) return undefined;
        revalidateReferences();
        const onReturn = () => {
            if (document.visibilityState === 'visible') revalidateReferences();
        };
        window.addEventListener('focus', onReturn);
        document.addEventListener('visibilitychange', onReturn);
        return () => {
            window.removeEventListener('focus', onReturn);
            document.removeEventListener('visibilitychange', onReturn);
        };
    }, [onScreen]);
}
