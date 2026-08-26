import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { unzipSync } from "fflate";

/**
 * Reads a package back the way an importer would, rather than the way it was written.
 *
 * The database goes through `node:sqlite`, which is a different SQLite build from the
 * sql.js one that produced it, so a mismatch in encoding or in what was actually
 * committed shows up here instead of being masked by a symmetric bug.
 */

/** One note as the collection stores it, with the two fields already split. */
export interface StoredNote {
  readonly back: string;
  readonly front: string;
  readonly sortField: string;
  readonly tags: string;
}

export interface StoredDeck {
  /** Every entry of the media manifest, keyed by the name cards reference it by. */
  readonly media: ReadonlyMap<string, Uint8Array>;
  readonly name: string;
  readonly notes: readonly StoredNote[];
}

/** Anki joins a note's fields with U+001F, written as an escape because nothing shows it. */
const FIELD_SEPARATOR = "\u001F";

const entriesOf = (apkg: Uint8Array): Map<string, Uint8Array> =>
  new Map(
    Object.entries(unzipSync(apkg)).filter(
      ([name]: readonly [string, Uint8Array]) => !name.endsWith("/"),
    ),
  );

/** The media manifest maps a numeric entry name to the filename the cards use. */
const mediaOf = (entries: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> => {
  const manifest = entries.get("media");
  const names = readMediaNames(manifest);

  return new Map(
    Object.entries(names).map(([entry, filename]: readonly [string, string]) => [
      filename,
      entries.get(entry) ?? new Uint8Array(),
    ]),
  );
};

/**
 * The archive's own JSON, which `JSON.parse` types as `any`. Asserting the shape at the
 * boundary is the only thing available: a guard would be a second, hand-written copy of
 * the collection schema whose drift nothing would catch.
 */
const readMediaNames = (data: Uint8Array | undefined): Record<string, string> =>
  data === undefined
    ? {}
    : (JSON.parse(Buffer.from(data).toString("utf8")) as Record<string, string>);

const readCollection = (at: string): Omit<StoredDeck, "media"> => {
  const db = new DatabaseSync(at, { readOnly: true });

  try {
    const rows = db
      .prepare(
        "SELECT notes.flds AS fields, notes.sfld AS sortField, notes.tags AS tags FROM notes",
      )
      .all();
    const [decks] = db.prepare("SELECT decks FROM col").all();

    return {
      name: Object.values(
        JSON.parse(String(decks?.decks ?? "{}")) as Record<string, { name: string }>,
      )
        .map(({ name }: Readonly<{ name: string }>) => name)
        .filter((deckName) => deckName !== "Default")
        .join(""),
      notes: rows.map((row: Readonly<Record<string, unknown>>) => {
        const [front = "", back = ""] = String(row.fields).split(FIELD_SEPARATOR);
        return { back, front, sortField: String(row.sortField), tags: String(row.tags) };
      }),
    };
  } finally {
    db.close();
  }
};

/**
 * `node:sqlite` opens a path rather than a buffer, so the collection is spilled to a
 * temporary file and removed again.
 */
export const readApkg = async (apkg: Uint8Array): Promise<StoredDeck> => {
  const entries = entriesOf(apkg);
  const collection = entries.get("collection.anki2");

  if (collection === undefined) {
    throw new Error(`No collection in the package: entries are ${[...entries.keys()].join(", ")}`);
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "ankimd-core-"));
  const at = path.join(directory, "collection.anki2");

  try {
    await writeFile(at, collection);

    return { media: mediaOf(entries), ...readCollection(at) };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};
