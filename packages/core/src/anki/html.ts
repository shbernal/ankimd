import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

/*
 * Markdown to the HTML an Anki field holds.
 *
 * Anki stores fields as HTML and renders them in a WebView, so this is the one place
 * the Markdown stops being source and starts being presentation. What that rendering
 * looks like is fixed here rather than configurable: a deck whose bullet lists become
 * paragraphs in one tool and lists in another is not the same deck, and §5.4 makes the
 * body arbitrary Markdown precisely so that a CommonMark renderer can be pointed at it.
 *
 * Syntax highlighting is the exception, and it is injected rather than imported. A
 * highlighter is a language table and a stylesheet, which is a hundred times the size
 * of everything else here and useful to exactly the callers that want it.
 */

/**
 * Colours one fenced code block.
 *
 * @param code the block's contents, undecorated.
 * @param language the fence's info string, or `undefined` when the fence carried none.
 * @returns HTML. Whatever comes back is inserted into a `<code>` element as-is, so an
 *   implementation that cannot handle the language must return the code escaped.
 */
export type Highlighter = (code: string, language: string | undefined) => string;

/**
 * A renderer, configured once and reused for every field of a deck.
 *
 * `breaks` is on: a single newline becomes a `<br>`. Cards are written as short lines
 * far more often than as reflowed prose, and a card whose lines silently join into one
 * paragraph reads as a bug to whoever wrote it.
 */
export const createHtmlRenderer = (highlight?: Highlighter) => {
  const marked = new Marked();

  if (highlight !== undefined) {
    marked.use(markedHighlight({ highlight: (code, language) => highlight(code, language) }));
  }

  marked.setOptions({ breaks: true, gfm: true, pedantic: false });

  /* `parse` is synchronous with the options above and typed as if it might not be,
     because an extension can make it asynchronous. Promising a promise is what lets a
     caller pass one that does. */
  return (markdown: string): Promise<string> => Promise.resolve(marked.parse(markdown));
};

export type HtmlRenderer = ReturnType<typeof createHtmlRenderer>;
