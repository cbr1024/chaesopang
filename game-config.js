/* Public game configuration. No keys or secrets belong here.
 * The build and source server derive ruleset from the packaged engine.
 * An empty API base uses the web origin; native packages need an HTTPS base. */
window.LumiConfig = Object.freeze({
  "rankingApiBase": "https://isgjrnpwivhpttfjnrri.supabase.co/functions/v1/chaesopang-ranking",
  "rankingTimeout": 6000,
  "ruleset": "lumi-f77b38bcf45aad26a7dc69b4"
});
