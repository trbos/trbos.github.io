import fs from "fs/promises";
import path from "path";

async function copyFile(src, dest) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
}

async function copyProjectFiles() {
    const rootDir = process.cwd();
    let distDir = path.join(rootDir, "dist");

    if (process.argv.includes("--debug")) {
        distDir = path.join(rootDir, "dist", "debug");
    } else {
        distDir = path.join(rootDir, "dist", "release");
    }

    // 1. Copy polylib.json and latest.json to dist/
    for (const file of ["polylib.json", "latest.json"]) {
        const srcPath = path.join(rootDir, file);
        const destPath = path.join(distDir, file);
        try {
            await copyFile(srcPath, destPath);
            console.log(`Copied ${file} to dist/`);
        } catch (e) {
            console.warn(`Warning: Could not copy ${file}: ${e.message}`);
        }
    }

    // 2. List folders inside dist/
    const distEntries = await fs.readdir(distDir, { withFileTypes: true });
    const distFolders = distEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

    // 3. For each folder in dist/, copy extra files from matching root folder
    for (const folder of distFolders) {
        const srcFolder = path.join(rootDir, folder);
        const destFolder = path.join(distDir, folder);

        try {
            const srcEntries = await fs.readdir(srcFolder, {
                withFileTypes: true,
            });

            // Copy all files (not directories)
            for (const entry of srcEntries) {
                if (entry.isFile() && !entry.name.endsWith(".ts")) {
                    const srcFile = path.join(srcFolder, entry.name);
                    const destFile = path.join(destFolder, entry.name);

                    await copyFile(srcFile, destFile);
                    console.log(`Copied ${folder}/${entry.name}`);
                }
            }
        } catch (e) {
            console.warn(
                `Warning: Could not copy files for folder ${folder}: ${e.message}`
            );
        }
    }
}

copyProjectFiles().catch((e) => {
    console.error("Error during copy:", e);
    process.exit(1);
});
