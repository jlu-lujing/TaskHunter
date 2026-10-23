/**
 * The tabs of the phone's workspace drawer (and the tablet's workspace panel),
 * in their default order. The user's order and hidden set are stored per
 * device in `useUIStore`; both hold plain ids so a tab added in a later
 * release shows up for everyone, at the end of a saved order.
 */
const MOBILE_WORKSPACE_TABS = ['changes', 'files', 'terminal', 'notes', 'mcp'] as const;

export type MobileWorkspaceTab = (typeof MOBILE_WORKSPACE_TABS)[number];

const isMobileWorkspaceTab = (id: string): id is MobileWorkspaceTab =>
  (MOBILE_WORKSPACE_TABS as readonly string[]).includes(id);

/** Every tab in the user's order; tabs the saved order does not name follow in default order. */
export const orderMobileWorkspaceTabs = (order: readonly string[]): MobileWorkspaceTab[] => {
  const ordered = order.filter(isMobileWorkspaceTab).filter((id, index, all) => all.indexOf(id) === index);
  return [...ordered, ...MOBILE_WORKSPACE_TABS.filter((id) => !ordered.includes(id))];
};

/**
 * The tabs the user keeps, in order. Never empty: a saved set that hides every
 * tab (written by hand or by an older build) shows them all.
 */
export const shownMobileWorkspaceTabs = (order: readonly string[], hidden: readonly string[]): MobileWorkspaceTab[] => {
  const all = orderMobileWorkspaceTabs(order);
  const shown = all.filter((id) => !hidden.includes(id));
  return shown.length > 0 ? shown : all;
};

/**
 * The tabs the strip offers right now: the ones the user keeps, plus the open
 * tab while something opened it although it is hidden (a changed file tapped
 * in the chat opens Changes either way). It leaves the strip once the user
 * switches away.
 */
export const stripMobileWorkspaceTabs = (
  order: readonly string[],
  hidden: readonly string[],
  active: MobileWorkspaceTab,
): MobileWorkspaceTab[] => {
  const shown = shownMobileWorkspaceTabs(order, hidden);
  if (shown.includes(active)) return shown;
  return orderMobileWorkspaceTabs(order).filter((id) => id === active || shown.includes(id));
};
