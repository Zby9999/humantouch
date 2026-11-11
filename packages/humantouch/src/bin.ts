import { run } from "./cli";

run(process.argv.slice(2), {
  cwd: process.cwd(),
  write: (text) => process.stdout.write(text),
  error: (text) => process.stderr.write(text),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error("Human Touch:", error);
    process.exitCode = 1;
  },
);
