#!/usr/bin/env bun
/**
 * Build script - compiles CLI and server to standalone binaries.
 * 
 * Usage: bun run build
 * 
 * Output:
 *   dist/sf-linux-x64      # CLI binary (Linux)
 *   dist/sf-darwin-x64     # CLI binary (macOS Intel)
 *   dist/sf-darwin-arm64   # CLI binary (macOS Apple Silicon)
 */

import { $ } from "bun";
import { mkdirSync, existsSync } from "fs";

const DIST_DIR = "./dist";

// Ensure dist directory exists
mkdirSync(DIST_DIR, { recursive: true });

type Target = "bun-linux-x64" | "bun-darwin-x64" | "bun-darwin-arm64";

interface BuildConfig {
  name: string;
  entry: string;
  targets: Target[];
}

const builds: BuildConfig[] = [
  {
    name: "sf",
    entry: "./cli/index.ts",
    targets: ["bun-linux-x64", "bun-darwin-x64", "bun-darwin-arm64"],
  },
];

async function build() {
  console.log("Building Kleo Static Files...\n");

  for (const config of builds) {
    for (const target of config.targets) {
      const platform = target.replace("bun-", "");
      const outName = `${config.name}-${platform}`;
      const outPath = `${DIST_DIR}/${outName}`;

      console.log(`  Building ${outName}...`);

      try {
        await $`bun build ${config.entry} --compile --target=${target} --outfile=${outPath}`.quiet();
        console.log(`    Done: ${outPath}`);
      } catch (e: any) {
        console.error(`    Failed: ${e.message}`);
      }
    }
  }

  console.log("\nBuild complete!");
  console.log(`\nBinaries in ${DIST_DIR}/`);

  // List outputs
  await $`ls -lh ${DIST_DIR}/sf-*`.nothrow();
}

build();
