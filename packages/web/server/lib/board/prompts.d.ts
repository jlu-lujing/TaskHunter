export declare const BOARD_PROMPT_IDS: {
  readonly evaluate: 'board.evaluate.instructions';
  readonly dispatchPr: 'board.dispatch.pr.instructions';
  readonly dispatchReport: 'board.dispatch.report.instructions';
  readonly checkReport: 'board.check.report.instructions';
  readonly checkPr: 'board.check.pr.instructions';
};

export declare const DEFAULT_BOARD_EVALUATE_INSTRUCTIONS: string;
export declare const DEFAULT_BOARD_DISPATCH_PR_INSTRUCTIONS: string;
export declare const DEFAULT_BOARD_DISPATCH_REPORT_INSTRUCTIONS: string;

export declare const DEFAULT_BOARD_CHECK_REPORT_INSTRUCTIONS: string;
export declare const DEFAULT_BOARD_CHECK_PR_INSTRUCTIONS: string;

export declare const CHECK_VERDICT_SCHEMA: object;

export declare const renderBoardTemplate: (
  template: string,
  variables: Readonly<Record<string, string>>,
) => string;
