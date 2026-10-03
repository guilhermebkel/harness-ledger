import { CLIModule } from "@/Shared/Modules/CLIModule.ts";

const FIRST_ARGUMENT_INDEX = 2;

new CLIModule().run(process.argv.slice(FIRST_ARGUMENT_INDEX));
