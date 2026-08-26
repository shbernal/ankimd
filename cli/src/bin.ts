#!/usr/bin/env node

import { hideBin } from "yargs/helpers";

import { main } from "./index.js";

/*
 * The executable, which is this and nothing else.
 *
 * Everything the command does is in `index.ts` and returns an exit code rather
 * than calling `process.exit`, so a test can run a whole conversion and read what
 * came of it. What is left here is the two lines that only make sense as a
 * process, and they are in a file of their own so that "untested" says something
 * about them rather than about the command.
 */

process.exitCode = await main(hideBin(process.argv));
