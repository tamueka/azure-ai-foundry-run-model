import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Guarda de arquitectura (hexagonal lite).
 *
 * Verifica automáticamente la regla de dependencia de `plan.md` §1: el dominio
 * no puede conocer SDKs, infraestructura, red ni consola. Sin esta prueba la
 * regla dependería solo de la disciplina al revisar código.
 */

const DOMAIN_DIR = fileURLToPath(new URL("../../src/domain/", import.meta.url));

const FORBIDDEN_MODULES = [
  "openai",
  "@azure/identity",
  "node:fs",
  "node:http",
  "node:https",
  "node:net",
];

const FORBIDDEN_PATH_FRAGMENTS = ["/infrastructure/", "../infrastructure", "/application/"];

function listTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

const domainFiles = listTypeScriptFiles(DOMAIN_DIR);

describe("regla de dependencia del dominio", () => {
  it("encuentra archivos del dominio", () => {
    expect(domainFiles.length).toBeGreaterThan(0);
  });

  it("no importa SDKs, red ni sistema de archivos", () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const source = readFileSync(file, "utf8");

      for (const moduleName of FORBIDDEN_MODULES) {
        const pattern = new RegExp(`from\\s+["']${moduleName.replace("/", "\\/")}`);

        if (pattern.test(source)) {
          violations.push(`${file} importa "${moduleName}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("no importa capas externas (infrastructure / application)", () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const source = readFileSync(file, "utf8");

      for (const fragment of FORBIDDEN_PATH_FRAGMENTS) {
        if (source.includes(fragment)) {
          violations.push(`${file} referencia "${fragment}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("no escribe directamente en consola", () => {
    const offenders = domainFiles.filter((file) =>
      /\bconsole\s*\./.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});