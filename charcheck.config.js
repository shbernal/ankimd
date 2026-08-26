/*
 * Em dashes are the tell this bans, checked from one place: `pnpm prose`, the
 * `pre-commit` job in lefthook.yml, and CI. The scope is prose people read
 * rather than source, because a dash inside a fenced example is data.
 */
const EM_DASH = "—";

const config = {
  ignore: ["node_modules/**", "dist/**", "coverage/**"],
  rules: [
    {
      chars: [EM_DASH],
      id: "no-em-dash",
      include: ["**/README.md", "CONTRIBUTING.md", "AGENTS.md", "docs/**/*.md"],
      message: "No em dashes. Use a comma, a colon, or reword.",
    },
  ],
};

export default config;
