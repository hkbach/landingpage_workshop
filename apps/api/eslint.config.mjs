import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "drizzle/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Nest injects by explicit token (@Inject), so imports used only as types are fine.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
);
