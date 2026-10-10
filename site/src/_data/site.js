// Everything the layout needs to say who this is. Fill in the three TODOs and
// the site is correct; everything else has a sane default.
export default {
  name: "llm-router",
  tagline: "One OpenAI-compatible endpoint in front of several model servers",
  description: "Register OpenAI-compatible providers, group them into workspaces, and point a client at one /v1 that lists and routes to every model they offer.",
  url: "https://cubicecho.github.io/llm-router/",
  repo: "https://github.com/cubicecho/llm-router",
  org: "https://cubicecho.com",
  // Optional — the layout only renders the ones you set.
  npm: null,
  docker: "https://github.com/cubicecho/llm-router/pkgs/container/llm-router",
};
