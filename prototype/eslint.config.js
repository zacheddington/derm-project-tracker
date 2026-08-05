import react from "eslint-plugin-react";

/* ---------------------------------------------------------------------
   Lint, scoped deliberately narrowly.

   This is not a style config — formatting is not worth a build failure,
   and nothing here reformats anyone's code. It exists for one class of
   defect: code that is no longer reachable and no longer true.

   An unused import is how a removed feature leaves a trace. The capture
   timer's `Clock` icon, the staleness banners' `AlertTriangle`, and a
   `label` helper that looked used because `.label` and `aria-label` are
   everywhere all survived a hand audit and were caught by this rule in a
   second. A person reading this repo for the first time cannot tell the
   difference between an import that is load-bearing and one that is
   residue; the linter can.

   `react/jsx-uses-vars` is what makes that trustworthy — without it, a
   component used only in JSX reads as unused and the rule cries wolf
   until somebody turns it off.
   --------------------------------------------------------------------- */

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx}"],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      // Arguments are exempt: a callback that ignores its second parameter
      // still has to declare it to reach the third.
      "no-unused-vars": ["error", { varsIgnorePattern: "^React$", args: "none" }],
    },
  },
];
