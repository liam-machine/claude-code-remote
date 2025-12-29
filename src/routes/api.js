/**
 * API Routes - REST endpoints for session and repo management
 */

import { 
  createSession, 
  getSession, 
  getAllSessions, 
  deleteSession,
  getSessionCount 
} from "../services/sessionManager.js";
import { 
  listRepos, 
  cloneRepo, 
  createRepo, 
  getRepo 
} from "../services/repoManager.js";
import { config } from "../config.js";

/**
 * Register API routes with Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export async function apiRoutes(fastify) {
  
  // ============================================
  // Session Routes
  // ============================================

  // List all sessions
  fastify.get("/api/sessions", async (request, reply) => {
    const sessions = getAllSessions();
    return sessions;
  });

  // Create new session
  fastify.post("/api/sessions", async (request, reply) => {
    try {
      const { repoPath } = request.body || {};
      const session = createSession({ repoPath });
      
      reply.code(201);
      return {
        id: session.id,
        repo: session.repo,
        repoPath: session.repoPath,
        status: session.status,
        createdAt: session.createdAt
      };
    } catch (err) {
      if (err.message.includes("Maximum sessions")) {
        reply.code(409);
        return { error: err.message };
      }
      throw err;
    }
  });

  // Get single session
  fastify.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    const session = getSession(id);
    
    if (!session) {
      reply.code(404);
      return { error: "Session not found" };
    }
    
    return {
      id: session.id,
      repo: session.repo,
      repoPath: session.repoPath,
      status: session.status,
      createdAt: session.createdAt
    };
  });

  // Delete session
  fastify.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    const deleted = deleteSession(id);
    
    if (!deleted) {
      reply.code(404);
      return { error: "Session not found" };
    }
    
    return { success: true, id };
  });

  // Session count (useful for checking limits)
  fastify.get("/api/sessions/count", async (request, reply) => {
    return { 
      count: getSessionCount(),
      max: config.maxSessions
    };
  });

  // ============================================
  // Repo Routes
  // ============================================

  // List all repositories
  fastify.get("/api/repos", async (request, reply) => {
    const repos = listRepos();
    return repos;
  });

  // Get single repository
  fastify.get("/api/repos/:name", async (request, reply) => {
    const { name } = request.params;
    const repo = getRepo(name);
    
    if (!repo) {
      reply.code(404);
      return { error: "Repository not found" };
    }
    
    return repo;
  });

  // Clone a repository from URL
  fastify.post("/api/repos/clone", async (request, reply) => {
    try {
      const { url, name } = request.body || {};
      
      if (!url) {
        reply.code(400);
        return { error: "URL is required" };
      }

      const result = await cloneRepo(url, name);
      reply.code(201);
      return result;
    } catch (err) {
      if (err.message.includes("already exists")) {
        reply.code(409);
        return { error: err.message };
      }
      reply.code(400);
      return { error: err.message };
    }
  });

  // Create a new repository
  fastify.post("/api/repos/create", async (request, reply) => {
    try {
      const { name } = request.body || {};
      
      if (!name) {
        reply.code(400);
        return { error: "Name is required" };
      }

      const result = await createRepo(name);
      reply.code(201);
      return result;
    } catch (err) {
      if (err.message.includes("already exists")) {
        reply.code(409);
        return { error: err.message };
      }
      reply.code(400);
      return { error: err.message };
    }
  });
}
