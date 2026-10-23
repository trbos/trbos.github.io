import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        files: ["**/*.{js,mjs,cjs}"],
        ignores: ["scripts/**"],
        plugins: { js },
        extends: ["js/recommended"],
    },
    {
        files: ["**/*.{js,mjs,cjs}"],
        ignores: ["scripts/**"],
        languageOptions: { globals: globals.browser },
    },
]);
