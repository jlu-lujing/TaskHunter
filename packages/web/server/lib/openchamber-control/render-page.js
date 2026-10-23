import { isString } from '../shared/guards.js';
import { OpenChamberControlError } from './error.js';

// The page travels in the tool call's input, which OpenCode stores with the
// message and streams to every client, and through the callback request, whose
// JSON body is capped at 1 MB. 200,000 characters stays under that cap even for
// text that encodes to several bytes per character, and is far more than a
// chart or table page needs.
export const RENDER_PAGE_MAX_HTML_LENGTH = 200_000;
export const RENDER_PAGE_MAX_TITLE_LENGTH = 120;

/**
 * When a page beats prose, and when it does not. Both the tool description
 * and the line every session carries (../session-knowledge/runtime.js) state
 * it. Stated only in the tool description, it went unread: asked for a
 * breakdown of lines of code per package, an agent answered with a list and
 * drew the chart only when asked. Interface mockups are named on their own:
 * listed only as data, the cases read to a literal model as "charts only",
 * while a proposed UI change is where a page helps most. The limits matter as
 * much as the cases: a page for two numbers is worse than a sentence.
 */
export const RENDER_PAGE_WHEN = "Use it when the answer is mostly data or structure the user would otherwise have to picture:"
  + " numbers compared across several items (sizes, counts, timings, costs, test or benchmark results),"
  + " a breakdown or share of a whole, a trend over time, options compared on several criteria,"
  + " a timeline of events, or how components connect."
  + " Use it too when the answer is about how something looks: a proposed interface change shown as it would appear,"
  + " before and after side by side, or layout options to choose between."
  + " Do not use it for a few numbers or a short list that reads fine as text, for code, or when the user asked for plain text."
  + " At most one page per answer.";

const SHOWN_NOTE = "Shown to the user in the chat above your reply. Don't announce, describe or restate the page; reply with only what it doesn't already say.";

/**
 * `render.page`: the chat draws the page straight from the call's input, so
 * this only checks that the input is a page the chat will draw and that the
 * tool is still on (a plugin generated before it was switched off must not keep
 * drawing).
 */
export const createRenderPageAction = ({ isEnabled }) => async (input) => {
  if (!await isEnabled()) {
    throw new OpenChamberControlError('The render tool is turned off in OpenChamber settings', 403);
  }
  const html = isString(input.html) ? input.html : '';
  if (!html.trim()) {
    throw new OpenChamberControlError('html is required: one complete, self-contained HTML document', 400);
  }
  if (html.length > RENDER_PAGE_MAX_HTML_LENGTH) {
    throw new OpenChamberControlError(`html is ${html.length} characters; the limit is ${RENDER_PAGE_MAX_HTML_LENGTH}. Make the page smaller, for example by drawing data with a script instead of writing out every element`, 400);
  }
  const title = isString(input.title) ? input.title.trim() : '';
  if (!title) {
    throw new OpenChamberControlError('title is required: a short name for the page', 400);
  }
  if (title.length > RENDER_PAGE_MAX_TITLE_LENGTH) {
    throw new OpenChamberControlError(`title is ${title.length} characters; the limit is ${RENDER_PAGE_MAX_TITLE_LENGTH}`, 400);
  }
  return { shown: true, title, note: SHOWN_NOTE };
};
