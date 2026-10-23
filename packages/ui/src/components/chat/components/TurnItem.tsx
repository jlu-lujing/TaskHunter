import React from 'react';

import type { ChatMessageEntry, Turn } from '../lib/turns/types';
import TurnAssistantBlock from './TurnAssistantBlock';

interface TurnItemProps {
    turn: Turn;
    renderMessage: (message: ChatMessageEntry) => React.ReactNode;
    assistantContent?: React.ReactNode;
}

const TurnItem: React.FC<TurnItemProps> = ({ turn, renderMessage, assistantContent }) => {
    return (
        <section
            className="relative w-full"
            id={`turn-${turn.turnId}`}
            data-turn-id={turn.turnId}
            data-scroll-spy-id={turn.turnId}
        >
            {renderMessage(turn.userMessage)}

            {assistantContent ?? <TurnAssistantBlock turnId={turn.turnId} assistantMessages={turn.assistantMessages} renderMessage={renderMessage} />}
        </section>
    );
};

export default React.memo(TurnItem);
