import { describe, expect, test } from 'bun:test';
import {
  BOARD_PROMPT_IDS,
  DEFAULT_BOARD_EVALUATE_INSTRUCTIONS,
  DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS,
  DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS,
  renderBoardTemplate,
} from '../../../web/server/lib/board/prompts.js';
import { getDefaultMagicPromptTemplate } from './magicPrompts';

// The UI Magic Prompts catalog shows these defaults for editing while the
// server applies them; drift between the two copies would silently change
// what users see vs what runs.
describe('board magic prompt defaults', () => {
  test('catalog templates match the server defaults', () => {
    expect(getDefaultMagicPromptTemplate(BOARD_PROMPT_IDS.evaluate)).toBe(DEFAULT_BOARD_EVALUATE_INSTRUCTIONS);
    expect(getDefaultMagicPromptTemplate(BOARD_PROMPT_IDS.dispatchPr)).toBe(DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS);
    expect(getDefaultMagicPromptTemplate(BOARD_PROMPT_IDS.dispatchReport)).toBe(DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS);
  });

  test('dispatch templates render the goal placeholder', () => {
    expect(renderBoardTemplate(DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS, { goal_definition: 'SHIP IT' }))
      .toContain('## Goal (completion criteria)\nSHIP IT');
    expect(renderBoardTemplate(DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS, { goal_definition: 'WHY' }))
      .toContain('WHY');
  });

  test('unknown placeholders stay visible', () => {
    expect(renderBoardTemplate('a {{mystery}} b', {})).toBe('a {{mystery}} b');
  });
});
