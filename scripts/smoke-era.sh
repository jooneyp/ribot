#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-3900}"
payload="$(node - "$repo_root/data/cases_replay.json" <<'NODE'
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const hook = data.cases.find((item) => item.id === "hook-1962");
if (!hook) throw new Error("hook-1962 case not found");
process.stdout.write(JSON.stringify({
  words: hook.her_words,
  report_words: hook.report_words ?? null,
  age_band: "80s",
  now_year: 2026,
}));
NODE
)"

result="$(curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data "$payload" \
  "http://localhost:${port}/api/era")"

printf '%s\n' "$result" | node -e '
let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { body += chunk; });
process.stdin.on("end", () => {
  const result = JSON.parse(body);
  console.log(JSON.stringify(result, null, 2));
  const range = result?.living_in?.year_range;
  if (!Array.isArray(range) || range.length !== 2 || range[0] > 1970 || range[1] < 1950) {
    console.error("living_in.year_range does not overlap 1950–1970");
    process.exit(1);
  }
});
'
