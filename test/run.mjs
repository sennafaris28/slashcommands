import esbuild from "esbuild";
import { execFileSync } from "node:child_process";

await esbuild.build({
  entryPoints: ["test/entry.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "test/.build/entry.cjs",
  alias: { obsidian: "./test/obsidian-stub.cjs" },
  logLevel: "error",
});
execFileSync(process.execPath, ["test/slash.test.cjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["test/codelang.test.cjs"], { stdio: "inherit" });
