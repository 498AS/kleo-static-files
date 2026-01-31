#!/usr/bin/env bun
import { sites, upload, files, stats } from "./commands";
import { MAIN_HELP } from "./help";

interface Options {
  json?: boolean;
  overwrite?: boolean;
  remove?: boolean;
}

function parseArgs(argv: string[]): { command: string; args: string[]; opts: Options } {
  const opts: Options = {};
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--overwrite") {
      opts.overwrite = true;
    } else if (arg === "--remove") {
      opts.remove = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const [command, ...args] = positional;
  return { command: command || "", args, opts };
}

const commands: Record<string, (args: string[], opts: Options) => Promise<void>> = {
  sites,
  upload,
  files,
  stats,
};

export async function run(argv: string[]) {
  const { command, args, opts } = parseArgs(argv);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(MAIN_HELP);
    return;
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.log(MAIN_HELP);
    process.exit(1);
  }

  try {
    await handler(args, opts);
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  run(process.argv.slice(2));
}
