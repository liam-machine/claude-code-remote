import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Load .env file manually (avoiding dotenv dependency)
function loadEnv() {
  const envPath = join(projectRoot, ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=");
        if (key && value !== undefined) {
          process.env[key.trim()] = value.trim();
        }
      }
    }
  }
}

loadEnv();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  reposDir: process.env.REPOS_DIR || "/home/liam/repos",
  maxSessions: parseInt(process.env.MAX_SESSIONS || "3", 10),
  projectRoot,
};
