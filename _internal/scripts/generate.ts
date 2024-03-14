#!/usr/bin/env deno run -A

import { assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolve } from "https://deno.land/std@0.214.0/path/mod.ts";
// import { ProjectMeta } from "../vendor/opengb/src/build/meta.ts";
import { ProjectMeta } from "../../../opengb/src/build/meta.ts";
import { emptyDir } from "https://deno.land/std@0.208.0/fs/mod.ts";

const opengbPath = resolve(
  import.meta.dirname!,
  "..",
  "vendor",
  "opengb",
);

const testProjectPath = resolve(
  import.meta.dirname!,
  "..",
  "vendor",
  "opengb-registry",
  "tests",
  "basic",
);

// console.log("Build OpenGB CLI");
// const installOutput = await new Deno.Command("deno", {
//   args: ["task", "artifacts:build:all"],
//   cwd: opengbPath,
//   stdout: "inherit",
//   stderr: "inherit",
// }).output();
// assert(installOutput.success);

// console.log("Building project");
// const buildOutput = await new Deno.Command("deno", {
//   args: [
//     "run",
//     "-A",
//     resolve(opengbPath, "src", "cli", "main.ts"),
//     "--path",
//     resolve(testProjectPath),
//     "build",
//   ],
//   stdout: "inherit",
//   stderr: "inherit",
// }).output();
// assert(buildOutput.success);

console.log("Generating meta");
const metaRaw = await Deno.readTextFile(
  resolve(testProjectPath, "_gen", "meta.json"),
);
const meta = JSON.parse(metaRaw) as ProjectMeta;

const templatesPath = resolve(import.meta.dirname!, "..", "templates");

const modulesPath = resolve(import.meta.dirname!, "..", "..", "modules");
await emptyDir(modulesPath);

const templates = {
  introduction: await Deno.readTextFile(
    resolve(templatesPath, "introduction.mdx"),
  ),
  moduleOverview: await Deno.readTextFile(
    resolve(templatesPath, "module_overview.mdx"),
  ),
  script: await Deno.readTextFile(
    resolve(templatesPath, "script.mdx"),
  ),
};

const moduleCards = Object.keys(meta.modules)
  .sort()
  .map((moduleName) => {
    const module = meta.modules[moduleName];
    return `<Card title="${moduleName}" icon="user" href="/modules/${moduleName}/overview" />`;
  });;
const introduction = templates.introduction.replace("%%MODULE_CARDS%%", moduleCards.join("\n"));
await Deno.writeTextFile(resolve(import.meta.dirname!, "..", "..", "introduction.mdx"), introduction);

let modulesNav: any = {
  "group": "Modules",
  "pages": [],
};

for (const moduleName of Object.keys(meta.modules).sort()) {
  const icon = "user";

  modulesNav.pages.push({
    "icon": icon,
    "group": moduleName,
    "pages": [
      `modules/${moduleName}/overview`,
      {
        "group": "Scripts",
        "pages": Object.keys(meta.modules[moduleName].scripts)
          .sort()
          .map((scriptName) => `modules/${moduleName}/scripts/${scriptName}`),
      },
    ],
  });

  const module = meta.modules[moduleName];
  const modulePath = resolve(modulesPath, moduleName);
  await emptyDir(modulePath);

  let dependencies: string;
  if (
    module.config.dependencies &&
    Object.keys(module.config.dependencies).length > 0
  ) {
    dependencies = Object.keys(module.config.dependencies)
      .sort()
      .map((dep) => `- [${dep}](/modules/${dep}/introduction)`)
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

  const scripts = Object.keys(module.scripts)
    .map((scriptName) =>
      `<Card title="${scriptName}" href="/modules/${moduleName}/scripts/${scriptName}" />`
    );

  const overview = templates.moduleOverview
    .replace("%%STABILITY%%", "Stable")
    .replace("%%DATABASE%%", module.db ? "✅" : "❌")
    .replace("%%AUTHORS%%", authors)
    .replace("%%DEPENDENCIES%%", dependencies)
    .replace("%%INSTALL%%", install)
    .replace("%%SCRIPTS%%", scripts.join("\n"));

  await Deno.writeTextFile(resolve(modulePath, "overview.mdx"), overview);

  await emptyDir(resolve(modulePath, "scripts"));
  for (const scriptName in module.scripts) {
    const script = module.scripts[scriptName];

    const scriptContent = templates.script
      .replace("%%TITLE%%", scriptName)
      .replace("%%PUBLIC%%", script.config.public ? "✅" : "❌");
    await Deno.writeTextFile(
      resolve(modulePath, "scripts", `${scriptName}.mdx`),
      scriptContent,
    );
  }
}

const mintTemplate = JSON.parse(
  await Deno.readTextFile(
    resolve(import.meta.dirname!, "..", "..", "mint.template.json"),
  ),
);
mintTemplate.navigation.push(modulesNav);
await Deno.writeTextFile(
  resolve(import.meta.dirname!, "..", "..", "mint.json"),
  JSON.stringify(mintTemplate, null, 2),
);
