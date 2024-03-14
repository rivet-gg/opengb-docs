#!/usr/bin/env deno run -A

import { resolve } from "https://deno.land/std@0.214.0/path/mod.ts";
// import { ProjectMeta } from "../vendor/opengb/src/build/meta.ts";
import { ModuleMeta, ProjectMeta } from "../../../opengb/src/build/meta.ts";
import { emptyDir } from "https://deno.land/std@0.208.0/fs/mod.ts";
import {
  assert,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { compile } from "npm:json-schema-to-typescript@^13.1.2";

const PROJECT_ROOT = resolve(import.meta.dirname!, "..", "..");
// const OPENGB_PATH = resolve(
//   PROJECT_ROOT,
//   "_internal",
//   "vendor",
//   "opengb",
// );
// const TEST_PROJECT_PATH = resolve(
//   PROJECT_ROOT,
//   "_internal",
//   "vendor",
//   "opengb-registry",
//   "tests",
//   "basic",
// );
const OPENGB_PATH = "/Users/nathan/rivet/opengb";
const TEST_PROJECT_PATH = "/Users/nathan/rivet/opengb-registry/tests/basic";

if (!Deno.env.get("SKIP_BUILD")) {
  console.log("Build OpenGB CLI");
  const installOutput = await new Deno.Command("deno", {
    args: ["task", "artifacts:build:all"],
    cwd: OPENGB_PATH,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  assert(installOutput.success);

  console.log("Building project");
  const buildOutput = await new Deno.Command("deno", {
    args: [
      "run",
      "-A",
      resolve(OPENGB_PATH, "src", "cli", "main.ts"),
      "--path",
      TEST_PROJECT_PATH,
      "build",
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  assert(buildOutput.success);
}

console.log("Reading meta");
const metaRaw = await Deno.readTextFile(
  resolve(TEST_PROJECT_PATH, "_gen", "meta.json"),
);
const meta = JSON.parse(metaRaw) as ProjectMeta;

// Clear modules
const TEMPLATES_PATH = resolve(PROJECT_ROOT, "_internal", "templates");
const DOCS_MODULES_PATH = resolve(PROJECT_ROOT, "modules");
await emptyDir(DOCS_MODULES_PATH);

// Load templates
const TEMPLATES = {
  introduction: await Deno.readTextFile(
    resolve(TEMPLATES_PATH, "introduction.mdx"),
  ),
  moduleOverview: await Deno.readTextFile(
    resolve(TEMPLATES_PATH, "module_overview.mdx"),
  ),
  script: await Deno.readTextFile(
    resolve(TEMPLATES_PATH, "script.mdx"),
  ),
};

// Sort modules
const modulesSorted = Object.entries(meta.modules)
  .sort((a, b) => a[1].config.name!.localeCompare(b[1].config.name!));

// Generate introduction
generateIntroduction();

// Generate modules
const modulesNav: any = {
  "group": "Modules",
  "pages": [],
};
for (const [moduleName, module] of modulesSorted) {
  await generateModule(moduleName, module);
}

// Write navigation
const mintTemplate = JSON.parse(
  await Deno.readTextFile(
    resolve(PROJECT_ROOT, "mint.template.json"),
  ),
);
mintTemplate.navigation.push(modulesNav);
await Deno.writeTextFile(
  resolve(PROJECT_ROOT, "mint.json"),
  JSON.stringify(mintTemplate, null, 2),
);

async function generateIntroduction() {
  const moduleCards = modulesSorted
    .map(([moduleName, module]) => {
      return `
        <Card title="${module.config.name}" icon="${module.config.icon}" href="/modules/${moduleName}/overview">
          <div>${module.config.description}</div>
          <Tags tags={${
        JSON.stringify([module.config.status, ...module.config.tags!])
      }} />
        </Card>
      `;
    });
  const introduction = TEMPLATES.introduction.replace(
    "%%MODULE_CARDS%%",
    moduleCards.join("\n"),
  );
  await Deno.writeTextFile(
    resolve(PROJECT_ROOT, "introduction.mdx"),
    introduction,
  );
}

async function generateModule(moduleName: string, module: ModuleMeta) {
  console.log("Generating module", moduleName);

  // Validate module
  assertExists(module.config.name, `Missing name for module "${moduleName}"`);
  assertExists(
    module.config.description,
    `Missing description for module "${moduleName}"`,
  );
  assertExists(module.config.icon, `Missing icon for module "${moduleName}"`);
  assertExists(module.config.tags, `Missing tags for module "${moduleName}"`);
  assertExists(
    module.config.status,
    `Missing status for module "${moduleName}"`,
  );

  // Validate scripts
  const scriptsSorted = Object.entries(module.scripts)
    .sort((a, b) => a[1].config.name!.localeCompare(b[1].config.name!));
  for (const [scriptName, script] of scriptsSorted) {
    assertExists(script.config.name, `Missing name for script "${scriptName}"`);
  }

  // Valdiate errors
  if (module.config.errors) {
    for (const [errorName, error] of Object.entries(module.config.errors)) {
      assertExists(error.name, `Missing name for error "${errorName}"`);
    }
  }

  // Add nav
  modulesNav.pages.push({
    "icon": module.config.icon,
    "group": module.config.name,
    "pages": [
      `modules/${moduleName}/overview`,
      {
        "group": "Scripts",
        "pages": Object.entries(meta.modules[moduleName].scripts)
          .sort((a, b) => a[1].config.name!.localeCompare(b[1].config.name!))
          .map(([scriptName]) => `modules/${moduleName}/scripts/${scriptName}`),
      },
    ],
  });

  const modulePath = resolve(DOCS_MODULES_PATH, moduleName);
  await emptyDir(modulePath);

  // Render
  let dependencies: string;
  if (
    module.config.dependencies &&
    Object.keys(module.config.dependencies).length > 0
  ) {
    dependencies = Object.keys(module.config.dependencies)
      .map((dep) => meta.modules[dep])
      .sort((a, b) => a.config.name!.localeCompare(b.config.name!))
      .map((module) =>
        `- [${module.config.name}](/modules/${module.name}/overview)`
      )
      .join("\n");
  } else {
    dependencies = "_No dependencies_";
  }

  let install: string;
  if (module.hasUserConfigSchema) {
    install = `modules:
  users:
    config:
      # Your config here. See below for more details.
`;
  } else {
    install = `modules:
  users: {}
`;
  }

  let authors: string;
  if (module.config.authors) {
    authors = module.config.authors
      .map((author) => `- [${author}](https://github.com/${author})`)
      .join("\n");
  } else {
    authors = "_No authors_";
  }

  const scriptCards = scriptsSorted
    .map(([scriptName, script]) =>
      `<Card title="${script.config.name}" href="/modules/${moduleName}/scripts/${scriptName}">${
        script.config.description ?? ""
      }</Card>`
    );

  let errors: string;
  if (module.config.errors) {
    errors = Object.entries(module.config.errors)
      .sort((a, b) => a[1].name!.localeCompare(b[1].name!))
      .map(([errorName, error]) =>
        `- **${error.name}** (\`${errorName}\`) ${error.description ?? ""}`
      )
      .join("\n");
  } else {
    errors = "_No errors_";
  }

  // Generate overview
  const overview = TEMPLATES.moduleOverview
    .replace(/%%NAME%%/g, moduleName)
    .replace(/%%DISPLAY_NAME%%/g, module.config.name!)
    .replace(/%%STATUS%%/g, module.config.status!)
    .replace(/%%DATABASE%%/g, module.db ? "Yes" : "No")
    .replace(/%%AUTHORS%%/g, authors)
    .replace(/%%DEPENDENCIES%%/g, dependencies)
    .replace(/%%DESCRIPTION%%/g, module.config.description!)
    .replace(/%%INSTALL%%/g, install)
    .replace(/%%SCRIPTS%%/g, scriptCards.join("\n"))
    .replace(/%%ERRORS%%/g, errors);
  await Deno.writeTextFile(resolve(modulePath, "overview.mdx"), overview);

  await emptyDir(resolve(modulePath, "scripts"));
  for (const [scriptName, script] of scriptsSorted) {
    const scriptContent = TEMPLATES.script
      .replace(/%%NAME%%/g, scriptName)
      .replace(/%%DISPLAY_NAME%%/g, script.config.name!)
      .replace(/%%MODULE_NAME%%/g, moduleName)
      .replace(/%%MODULE_DISPLAY_NAME%%/g, module.config.name!)
      .replace(/%%DESCRIPTION%%/g, script.config.description ?? "")
      .replace(/%%PUBLIC%%/g, script.config.public ? "Yes" : "No")
      .replace(
        /%%REQUEST_SCHEMA%%/g,
        await schemaToTypeScript(script.requestSchema, "Request"),
      )
      .replace(
        /%%RESPONSE_SCHEMA%%/g,
        await schemaToTypeScript(script.responseSchema, "Response"),
      );
    await Deno.writeTextFile(
      resolve(modulePath, "scripts", `${scriptName}.mdx`),
      scriptContent,
    );
  }
}

async function schemaToTypeScript(schema: any, name: string): Promise<string> {
  const ts = await compile(schema, name, {
    bannerComment: "",
    unknownAny: false,
  });
  return ts.trim();
}
