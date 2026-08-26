#!/usr/bin/env node

/** Node puts the executable and the script ahead of the user's arguments. */
const ARGV_OFFSET = 2;

/**
 * The `ankimd` binary. A stub until the commands land.
 */
const main = (argv: readonly string[]): number => {
  process.stdout.write(`ankimd: no commands yet (${argv.length} arguments)\n`);
  return 0;
};

export default main;

if (process.argv[1] === import.meta.filename) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}
