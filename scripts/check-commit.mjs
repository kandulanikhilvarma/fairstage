import { readFileSync } from "node:fs";
const message = readFileSync(process.argv[2],"utf8");
if (/co-authored-by:.*(claude|anthropic|openai|copilot|chatgpt)|claude-session:|generated with (claude|chatgpt)/i.test(message)) {
  console.error("Remove the automated-tool attribution trailer.");
  process.exit(1);
}
if (!/^(feat|fix|chore|docs|ci|test|refactor)(\([^\n]+\))?: .{1,54}$/u.test(message.split("\n")[0])) {
  console.error("Use a Conventional Commit subject with at most 60 characters.");
  process.exit(1);
}
