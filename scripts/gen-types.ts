#!/usr/bin/env bun
/**
 * Fetches OpenAPI spec from the server and generates TypeScript types
 *
 * Usage: bun run scripts/gen-types.ts [url]
 */

const API_URL = process.argv[2] || process.env.SF_API_URL || "http://localhost:3000";

async function main() {
  console.log(`Fetching OpenAPI spec from ${API_URL}/openapi.json...`);

  const res = await fetch(`${API_URL}/openapi.json`);
  if (!res.ok) {
    console.error(`Failed to fetch: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const spec = await res.json();

  // Save the spec
  await Bun.write("./openapi.json", JSON.stringify(spec, null, 2));
  console.log("Saved openapi.json");

  // Generate types from schemas
  const schemas = spec.components?.schemas || {};
  let types = "// Generated from OpenAPI spec\n\n";

  for (const [name, schema] of Object.entries(schemas)) {
    types += `export interface ${name} {\n`;
    const props = (schema as any).properties || {};
    const required = (schema as any).required || [];

    for (const [propName, propSchema] of Object.entries(props)) {
      const isRequired = required.includes(propName);
      const tsType = zodToTs(propSchema as any);
      types += `  ${propName}${isRequired ? "" : "?"}: ${tsType};\n`;
    }
    types += "}\n\n";
  }

  await Bun.write("./types.generated.ts", types);
  console.log("Generated types.generated.ts");
}

function zodToTs(schema: any): string {
  if (schema.type === "string") return "string";
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "array") {
    return `${zodToTs(schema.items)}[]`;
  }
  if (schema.type === "object") {
    if (schema.properties) {
      const props = Object.entries(schema.properties)
        .map(([k, v]) => `${k}: ${zodToTs(v as any)}`)
        .join("; ");
      return `{ ${props} }`;
    }
    return "Record<string, unknown>";
  }
  if (schema.nullable) {
    return `${zodToTs({ ...schema, nullable: undefined })} | null`;
  }
  if (schema.$ref) {
    return schema.$ref.split("/").pop();
  }
  return "unknown";
}

main().catch(console.error);
