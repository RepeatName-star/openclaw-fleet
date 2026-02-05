import fs from "node:fs";
import path from "node:path";

function collectFiles(dir: string, out: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
        continue;
      }
      collectFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".ts")) {
      out.push(fullPath);
    }
  }
}

function findRelativeSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bimport\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'";]+\s+from\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(source)) !== null) {
      specs.push(match[1]);
    }
  }
  return specs;
}

test("relative ESM imports include .js extension", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const files: string[] = [];
  collectFiles(path.join(repoRoot, "src"), files);
  collectFiles(path.join(repoRoot, "tests"), files);

  const offenders: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const specifiers = findRelativeSpecifiers(content);
    for (const specifier of specifiers) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        if (!specifier.endsWith(".js")) {
          offenders.push(`${path.relative(repoRoot, file)}: ${specifier}`);
        }
      }
    }
  }

  expect(offenders).toEqual([]);
});
