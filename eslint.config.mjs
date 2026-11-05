import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**", "apps/driver/android/**", "apps/driver/ios/**", "apps/driver/dist/**", "apps/driver/.expo/**",
      "dist/**",
      ".vinext/**",
      ".wrangler/**",
      ".sites-runtime/**",
      "work/**",
      "outputs/**",
      "public/**",
      "scripts/**",
      "lib/**",
      "next-env.d.ts",
    ],
  },
  {
    files: [
      "apps/**/*.{ts,tsx}",
      "packages/**/*.ts",
      "db/**/*.ts",
      "tests/**/*.ts",
      "app/**/*.{ts,tsx}",
      "worker/**/*.ts",
    ],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
