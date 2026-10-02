// Entry point of the `imh` script (bundled to dist/imh.mjs).

import { CLIModule } from "./Shared/Modules/CLIModule.js";

const FIRST_ARGUMENT_INDEX = 2;

new CLIModule().run(process.argv.slice(FIRST_ARGUMENT_INDEX));
