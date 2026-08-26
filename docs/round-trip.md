# The round trip, and what it loses

Flashcard Markdown and Anki's collection are not the same shape, and converting
between them is lossy in both directions. This page is the table of what
survives and what does not. It is a reference rather than a warning: everything
here is deliberate, tested, and reported at run time as a diagnostic where §3.3
requires it.

There is one promise that holds regardless. **The conversion reaches a fixpoint
after one pass.** Markdown to package to Markdown may change the file; doing it
again changes nothing. Every canonical case in the spec's conformance corpus is
asserted both ways in `packages/core/test/corpus-apkg.test.ts`, and nine of the
fourteen come back byte for byte.

## Markdown to package

Anki stores a note as a list of field values plus tags. Everything a deck file
carries that is not one of those has nowhere to go.

| What                                 | What happens                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Frontmatter                          | Dropped, except `tags`                                                                                  |
| File-level tags                      | Kept, on every card. §6.1 makes them apply to each card anyway, so nothing is lost                      |
| Preamble                             | Dropped. It belongs to no card (§4.3), and Anki has no per-deck text                                    |
| Deck title                           | Becomes the Anki deck's name                                                                            |
| Card heading                         | Rendered into the first field, as an `<h2>`                                                             |
| Front region                         | Rendered into the first field, after the heading                                                        |
| `***`                                | Not stored. Its position is implied by the `<h2>`, so an empty front region loses the separator         |
| Back                                 | Rendered into the second field                                                                          |
| Card tags                            | Kept, with `/` mapped to `::` (§6.5)                                                                    |
| A tag holding whitespace             | Rewritten with underscores, and reported (`tag-sanitized`)                                              |
| Images                               | The reference is kept; the file is packaged when a resolver is given                                    |
| Two cards with identical fields      | One note, and the second is reported (`unrepresentable-content`). Anki identifies a note by its content |
| A card whose front strips to nothing | Not written, and reported (`malformed-card-skipped`). Anki drops such a note on import                  |

Soft line breaks inside a paragraph are not stored, because HTML has no
character for them: `a\nb` inside one paragraph renders to `a b`. This is
CommonMark's own reading of a soft break, and it is why the Markdown renderer
runs with `breaks` off.

## Package to Markdown

**This direction destroys scheduling.** It reads notes and nothing else. A deck
extracted to Markdown and written back to a package is a new deck: every review,
every interval and every note identity is gone.

`apkg -> md -> apkg` is not a round trip and is not offered as one. Anyone
editing a deck they are studying should edit it in Anki.

| What                                                           | What happens                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Scheduling: due dates, intervals, ease, lapses, the review log | Dropped                                                                                                                            |
| Note GUIDs and ids                                             | Dropped. A re-imported deck lands as new notes                                                                                     |
| Deck names and the deck tree                                   | Dropped. Anki keeps them on cards rather than on notes, and a package may hold several. The extracted deck is titled by the caller |
| Deck options and presets                                       | Dropped                                                                                                                            |
| Card ordering and positions                                    | Dropped                                                                                                                            |
| Note types other than a two-field, non-cloze one               | The notes are not extracted, and each kind is counted and named (`unrepresentable-content`)                                        |
| Cloze notes                                                    | Same. The format has no cloze syntax                                                                                               |
| A note whose first field is empty                              | Not extracted, and reported. §5.2 keys a card's identity on its heading                                                            |
| Tags                                                           | Kept, with `::` mapped to `/`                                                                                                      |
| A tag with characters §6.2 forbids                             | Rewritten, and reported (`tag-sanitized`); one that cannot be rewritten into a tag at all is left out and reported                 |
| Media not referenced by an extracted note                      | Not returned                                                                                                                       |
| A local image reference with no file in the package            | The reference is kept and reported (`unresolved-image`)                                                                            |
| A remote image reference                                       | Kept, and not reported. Most images in a real collection are remote URLs with no media entry                                       |

### What happens to a field's HTML

An Anki field is arbitrary HTML: written by its editor, by a third-party
exporter, or pasted from a web page. Turning that back into Markdown is where
this direction does its real work.

| What                                                  | What happens                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nested lists                                          | Kept, as two-space indentation                                                                                                                                                         |
| `b` / `strong`, `i` / `em`, `code`, `a`, `img`, `pre` | Mapped to Markdown                                                                                                                                                                     |
| `sup`, `sub`                                          | Kept as HTML, which is valid Markdown and loses nothing                                                                                                                                |
| `h1`, `h2` inside a field                             | Demoted to `###`. `##` is the card boundary (§5.1), so a heading written as-is would split the card                                                                                    |
| `hr`                                                  | Written as `---`, never as `***`, which is the front/back separator                                                                                                                    |
| Any other element                                     | Its text is kept; the element is not. `span`, `font`, `div` and the presentation attributes a tool like RemNote writes on every list item all go                                       |
| A field's first `<h2>`                                | Read as the card's heading, which is what makes a deck this package wrote survive unchanged                                                                                            |
| A front field with no leading `<h2>`                  | Its last line becomes the heading and the whole field stays in the front region. A field written by RemNote is the path to the card rather than the card, and its leaf is the question |

The last row is the one judgement call here, and it was measured rather than
guessed. Across three real decks, taking the first line gives 24 distinct
headings for 1351 notes and 1 for 765; taking the last gives 1343 and 755. §5.2
makes the heading a card's whole identity, and thousands of cards sharing one is
not an identity.

## What the CLI refuses

`ankimd` will not overwrite an existing `.apkg`. Building a deck over one you
are studying is the way to lose review history without noticing.
