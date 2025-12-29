/**
 * Repo Manager - Manages repositories in the repos directory
 */

import { readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { join, basename, resolve } from "path";
import { spawn } from "child_process";
import { config } from "../config.js";

/**
 * Check if a directory is a git repository
 * @param {string} dirPath - Path to check
 * @returns {boolean} True if .git exists
 */
function isGitRepo(dirPath) {
  return existsSync(join(dirPath, ".git"));
}

/**
 * Validate that a path is safely within the repos directory
 * @param {string} targetPath - Path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(targetPath) {
  const resolved = resolve(targetPath);
  const reposResolved = resolve(config.reposDir);
  return resolved.startsWith(reposResolved + "/") || resolved === reposResolved;
}

/**
 * List all repositories in the repos directory
 * @returns {Array} Array of repo objects with name, path, isGit, lastModified
 */
export function listRepos() {
  const reposDir = config.reposDir;
  
  // Ensure repos directory exists
  if (!existsSync(reposDir)) {
    mkdirSync(reposDir, { recursive: true });
    return [];
  }

  const entries = readdirSync(reposDir, { withFileTypes: true });
  
  return entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
    .map(entry => {
      const fullPath = join(reposDir, entry.name);
      const stats = statSync(fullPath);
      
      return {
        name: entry.name,
        path: fullPath,
        isGit: isGitRepo(fullPath),
        lastModified: stats.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

/**
 * Clone a repository from a URL
 * @param {string} url - Git URL to clone
 * @param {string} [name] - Optional custom name for the repo
 * @returns {Promise<Object>} Result object with name, path, status
 */
export function cloneRepo(url, name) {
  return new Promise((resolve, reject) => {
    // Extract repo name from URL if not provided
    const repoName = name || basename(url, ".git").replace(/\.git$/, "");
    
    // Validate name
    if (!repoName || !/^[a-zA-Z0-9_-]+$/.test(repoName)) {
      return reject(new Error("Invalid repository name"));
    }

    const targetPath = join(config.reposDir, repoName);
    
    // Check if already exists
    if (existsSync(targetPath)) {
      return reject(new Error("Repository already exists: " + repoName));
    }

    // Ensure repos directory exists
    if (!existsSync(config.reposDir)) {
      mkdirSync(config.reposDir, { recursive: true });
    }

    console.log("[Repo] Cloning:", url, "to:", targetPath);

    const gitProcess = spawn("git", ["clone", url, repoName], {
      cwd: config.reposDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    gitProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    gitProcess.on("close", (code) => {
      if (code === 0) {
        console.log("[Repo] Clone successful:", repoName);
        resolve({
          name: repoName,
          path: targetPath,
          status: "cloned"
        });
      } else {
        console.error("[Repo] Clone failed:", stderr);
        reject(new Error("Clone failed: " + (stderr.trim() || "Unknown error")));
      }
    });

    gitProcess.on("error", (err) => {
      console.error("[Repo] Clone error:", err);
      reject(new Error("Clone error: " + err.message));
    });
  });
}

/**
 * Create a new empty git repository
 * @param {string} name - Name for the new repo
 * @returns {Promise<Object>} Result object with name, path, status
 */
export function createRepo(name) {
  return new Promise((resolve, reject) => {
    // Validate name
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return reject(new Error("Invalid repository name. Use only letters, numbers, hyphens, and underscores."));
    }

    const targetPath = join(config.reposDir, name);
    
    // Check if already exists
    if (existsSync(targetPath)) {
      return reject(new Error("Repository already exists: " + name));
    }

    // Ensure repos directory exists
    if (!existsSync(config.reposDir)) {
      mkdirSync(config.reposDir, { recursive: true });
    }

    console.log("[Repo] Creating:", targetPath);

    // Create directory
    mkdirSync(targetPath);

    // Initialize git repository
    const gitProcess = spawn("git", ["init"], {
      cwd: targetPath,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    gitProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    gitProcess.on("close", (code) => {
      if (code === 0) {
        console.log("[Repo] Created successfully:", name);
        resolve({
          name: name,
          path: targetPath,
          status: "created"
        });
      } else {
        console.error("[Repo] Create failed:", stderr);
        reject(new Error("Failed to initialize git: " + (stderr.trim() || "Unknown error")));
      }
    });

    gitProcess.on("error", (err) => {
      console.error("[Repo] Create error:", err);
      reject(new Error("Create error: " + err.message));
    });
  });
}

/**
 * Get repo info by name
 * @param {string} name - Repository name
 * @returns {Object|null} Repo info or null if not found
 */
export function getRepo(name) {
  const targetPath = join(config.reposDir, name);
  
  if (!existsSync(targetPath) || !isPathSafe(targetPath)) {
    return null;
  }

  const stats = statSync(targetPath);
  if (!stats.isDirectory()) {
    return null;
  }

  return {
    name: name,
    path: targetPath,
    isGit: isGitRepo(targetPath),
    lastModified: stats.mtime.toISOString()
  };
}
