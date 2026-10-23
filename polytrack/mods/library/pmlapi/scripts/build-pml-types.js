import readline from "readline";
import fs from "fs";
import https from "https";
import { execSync } from "child_process";
import path from "path";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Enter version: ", (version) => {
    const url = `https://pml.orangy.cfd/PolyTrackMods/PolyModLoader/${version}/PolyModLoader.ts`;
    const fileName = "PolyModLoader.ts";
    // const outputName = `PolyModLoader.${version}.d.ts`;
    const outputName = `PolyModLoader.${version}.ts`;
    const outputPath = path.resolve("types", outputName);

    console.log(`📥 Downloading: ${url}`);
    https
        .get(url, (res) => {
            if (res.statusCode !== 200) {
                console.error(`❌ Failed to download: ${res.statusCode}`);
                rl.close();
                return;
            }

            const fileStream = fs.createWriteStream(fileName);
            res.pipe(fileStream);

            fileStream.on("finish", () => {
                fileStream.close();

                // console.log("📦 Compiling with tsc...");
                // try {
                //   execSync(`tsc --target es2020 --module nodenext --declaration --emitDeclarationOnly --outFile ${outputName} --strict --esModuleInterop --moduleResolution nodenext --noImplicitAny false --strictPropertyInitialization false ./PolyModLoader.ts`, {
                //     stdio: "inherit"
                //   });

                //   fs.renameSync(outputName, outputPath);
                //   fs.unlinkSync(fileName);

                //   console.log(`✅ Output saved to: ${outputPath}`);
                // } catch (err) {
                //   console.log(err)
                //   console.error("❌ Compilation failed");
                // }

                let updatedContent;
                try {
                    const content = fs.readFileSync(fileName, "utf8");
                    updatedContent = `// @ts-nocheck\n${content}`;
                } catch (err) {
                    console.error("❌ Error reading file:", err);
                }

                try {
                    fs.writeFileSync(outputPath, updatedContent);
                    fs.unlinkSync(fileName);
                    console.log(`✅ Output saved to: ${outputPath}`);
                } catch (err) {
                    console.error("❌ Error moving file:", err);
                }

                const tsconfigPath = path.resolve("tsconfig.json");
                try {
                    const tsconfig = JSON.parse(
                        fs.readFileSync(tsconfigPath, "utf8")
                    );

                    if (!tsconfig.compilerOptions)
                        tsconfig.compilerOptions = {};
                    if (!tsconfig.compilerOptions.paths)
                        tsconfig.compilerOptions.paths = {};

                    const importUrl = `../../../../PolyTypes.js`;
                    const relativePath = `types/PolyModLoader.${version}.ts`;

                    tsconfig.compilerOptions.paths[importUrl] = [relativePath];

                    fs.writeFileSync(
                        tsconfigPath,
                        JSON.stringify(tsconfig, null, 2)
                    );
                    console.log(
                        `🔧 Updated tsconfig.json with path mapping for ${version}`
                    );
                } catch (err) {
                    console.error("❌ Failed to update tsconfig.json:", err);
                }

                rl.close();
            });
        })
        .on("error", (err) => {
            console.error("❌ Error downloading file:", err);
            rl.close();
        });
});
