// Creates .env from .env.example on first setup. Never overwrites an existing
// .env. Written in Node rather than `cp` so it works on Windows too.
import { copyFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists, leaving it alone");
} else {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}
