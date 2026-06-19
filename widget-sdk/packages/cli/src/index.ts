import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

program
  .name("pinwall-widget")
  .description("PinWall Widget CLI - Create, validate and build widgets")
  .version("0.1.0");

// ── init ─────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize a new Widget project from template")
  .argument("<name>", "Widget project name")
  .option("-t, --template <template>", "Template to use", "basic")
  .action((name: string, options: { template: string }) => {
    const dir = path.resolve(process.cwd(), name);
    if (fs.existsSync(dir)) {
      console.error(`Error: Directory "${name}" already exists.`);
      process.exit(1);
    }

    fs.mkdirSync(dir, { recursive: true });

    // Create widget.json
    const manifest = {
      id: `com.example.${name.replace(/[^a-zA-Z0-9]/g, "-")}`,
      name: name,
      description: `A PinWall widget: ${name}`,
      version: "1.0.0",
      author: "",
      entry: "index.html",
      icon: "icon.png",
      type: "community",
      category: "utility",
      permissions: ["storage", "theme", "i18n"],
      defaultSize: { width: 200, height: 200 },
      minSize: { width: 150, height: 150 },
      maxSize: { width: 400, height: 400 },
      settings: [],
    };
    fs.writeFileSync(
      path.join(dir, "widget.json"),
      JSON.stringify(manifest, null, 2)
    );

    // Create index.html
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter Variable', -apple-system, BlinkMacSystemFont, sans-serif;
      background: transparent;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }
    .widget {
      text-align: center;
      padding: 16px;
    }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    p { font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="widget">
    <h2>Hello, PinWall!</h2>
    <p>This is the ${name} widget.</p>
  </div>
  <script type="module" src="./main.js"></script>
</body>
</html>`
    );

    // Create main.js
    fs.writeFileSync(
      path.join(dir, "main.js"),
      `// PinWall Widget Entry
// Import the SDK: import PinWall from '@pinwall/widget-sdk'

// For now, use the global PinWall object injected by the host
// PinWall.onReady((config) => {
//   console.log('Widget ready:', config);
// });

console.log('${name} widget loaded');
`
    );

    // Create placeholder icon
    // (1x1 transparent PNG as placeholder)
    const placeholderIcon = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    fs.writeFileSync(path.join(dir, "icon.png"), placeholderIcon);

    console.log(`\nWidget project "${name}" created successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${name}`);
    console.log(`  # Edit widget.json and index.html`);
    console.log(`  pinwall-widget validate`);
    console.log(`  pinwall-widget build`);
  });

// ── validate ─────────────────────────────────────────────

program
  .command("validate")
  .description("Validate widget.json manifest")
  .option("-d, --dir <directory>", "Widget directory", ".")
  .action((options: { dir: string }) => {
    const dir = path.resolve(process.cwd(), options.dir);
    const manifestPath = path.join(dir, "widget.json");

    if (!fs.existsSync(manifestPath)) {
      console.error("Error: widget.json not found in", dir);
      process.exit(1);
    }

    try {
      const content = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(content);

      // Basic validation
      const errors: string[] = [];
      if (!manifest.id) errors.push("Missing required field: id");
      if (!manifest.name) errors.push("Missing required field: name");
      if (!manifest.version) errors.push("Missing required field: version");
      if (!manifest.entry) errors.push("Missing required field: entry");
      if (!Array.isArray(manifest.permissions)) errors.push("permissions must be an array");
      if (!manifest.defaultSize?.width || !manifest.defaultSize?.height) {
        errors.push("defaultSize must have width and height");
      }

      // Check entry file exists
      const entryPath = path.join(dir, manifest.entry || "index.html");
      if (!fs.existsSync(entryPath)) {
        errors.push(`Entry file not found: ${manifest.entry}`);
      }

      if (errors.length > 0) {
        console.error("Validation failed:");
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
      }

      console.log(`Widget "${manifest.name}" v${manifest.version} is valid.`);
    } catch (err: any) {
      console.error("Error parsing widget.json:", err.message);
      process.exit(1);
    }
  });

// ── build ────────────────────────────────────────────────

program
  .command("build")
  .description("Build widget into .pwx package (zip)")
  .option("-d, --dir <directory>", "Widget directory", ".")
  .option("-o, --output <output>", "Output directory", "./dist")
  .action(async (options: { dir: string; output: string }) => {
    const dir = path.resolve(process.cwd(), options.dir);
    const outputDir = path.resolve(process.cwd(), options.output);
    const manifestPath = path.join(dir, "widget.json");

    if (!fs.existsSync(manifestPath)) {
      console.error("Error: widget.json not found");
      process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const outputFile = path.join(outputDir, `${manifest.id}-${manifest.version}.pwx`);

    fs.mkdirSync(outputDir, { recursive: true });

    try {
      // Dynamic import for archiver (ESM compat)
      const archiver = (await import("archiver")).default;
      const output = fs.createWriteStream(outputFile);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        const sizeKb = (archive.pointer() / 1024).toFixed(1);
        console.log(`Built: ${outputFile} (${sizeKb} KB)`);
      });

      archive.on("error", (err: Error) => {
        console.error("Archive error:", err.message);
        process.exit(1);
      });

      archive.pipe(output);

      // Add files, excluding node_modules, .git, dist
      archive.directory(dir, false, (entry) => {
        const excluded = ["node_modules", ".git", "dist", ".DS_Store"];
        const name = entry.name.split("/")[0];
        if (excluded.includes(name)) return false;
        return entry;
      });

      archive.finalize();
    } catch (err: any) {
      console.error("Build failed:", err.message);
      console.log("Make sure archiver is installed: npm install archiver");
      process.exit(1);
    }
  });

program.parse();
