#!/usr/bin/env bun
/**
 * Script to generate API keys for the Static Files API.
 * 
 * Usage: bun run scripts/create-key.ts "key-name"
 * 
 * The key is displayed once and cannot be recovered. Store it securely.
 */

import { createHash, randomBytes } from "crypto";
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.SF_DB_PATH || "./data/static-files.db";

function generateApiKey(): string {
  const bytes = randomBytes(24);
  return `sk_${bytes.toString("base64url")}`;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function main() {
  const name = process.argv[2];
  
  if (!name) {
    console.error("Usage: bun run scripts/create-key.ts <key-name>");
    console.error("");
    console.error("Example:");
    console.error("  bun run scripts/create-key.ts my-app");
    process.exit(1);
  }

  // Ensure data directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });
  
  const db = new Database(DB_PATH);
  
  // Ensure api_keys table exists
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY,
      key_hash TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Generate key
  const key = generateApiKey();
  const hash = hashKey(key);

  // Insert into DB
  try {
    const stmt = db.prepare(
      "INSERT INTO api_keys (key_hash, name) VALUES (?, ?) RETURNING id, name, created_at"
    );
    const result = stmt.get(hash, name) as { id: number; name: string; created_at: string };

    console.log("");
    console.log("✓ API key created successfully!");
    console.log("");
    console.log("  Name:", result.name);
    console.log("  ID:", result.id);
    console.log("  Created:", result.created_at);
    console.log("");
    console.log("  API Key:", key);
    console.log("");
    console.log("⚠️  Save this key now! It cannot be recovered.");
    console.log("");
    console.log("Usage:");
    console.log(`  export SF_API_KEY=${key}`);
    console.log("  sf sites list");
  } catch (e: any) {
    if (e.message.includes("UNIQUE constraint failed")) {
      console.error("Error: A key with this hash already exists (extremely unlikely collision).");
      process.exit(1);
    }
    throw e;
  } finally {
    db.close();
  }
}

main();
