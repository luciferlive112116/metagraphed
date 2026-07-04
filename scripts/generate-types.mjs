import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { repoRoot } from "./lib.mjs";

const generatedOutputPath = path.join(
  repoRoot,
  "generated/metagraphed-api.d.ts",
);
const publicOutputPath = path.join(repoRoot, "public/metagraph/types.d.ts");
const openapiTypescriptCli = path.join(
  repoRoot,
  "node_modules/openapi-typescript/bin/cli.js",
);
const result = spawnSync(
  process.execPath,
  [openapiTypescriptCli, "public/metagraph/openapi.json"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    // The generated d.ts now exceeds the 1 MB spawnSync default; match the 50 MB
    // buffer the build uses (scripts/build-artifacts.mjs) so stdout is not
    // truncated (ENOBUFS) when writing the committed type artifacts.
    maxBuffer: 50 * 1024 * 1024,
  },
);

if (result.status !== 0) {
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  process.exit(result.status || 1);
}

await fs.mkdir(path.dirname(generatedOutputPath), { recursive: true });
await fs.mkdir(path.dirname(publicOutputPath), { recursive: true });
await fs.writeFile(generatedOutputPath, result.stdout, "utf8");
await fs.writeFile(publicOutputPath, result.stdout, "utf8");

console.log("Generated Metagraphed API TypeScript definitions.");
