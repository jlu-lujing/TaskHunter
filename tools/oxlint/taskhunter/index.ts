import { eslintCompatPlugin } from "@oxlint/plugins";

import { noPhysicalSidesRule } from "./rules/no-physical-sides.ts";

/** TaskHunter's own lint rules, run by `oxlint.config.ts`. */
const taskhunterPlugin = eslintCompatPlugin({
  meta: { name: "taskhunter" },
  rules: {
    "no-physical-sides": noPhysicalSidesRule,
  },
});

export default taskhunterPlugin;
