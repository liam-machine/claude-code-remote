/**
 * API Routes - REST endpoints for session and repo management
 */

import { 
  createSession, 
  getSession, 
  getAllSessions, 
  deleteSession,
  getSessionCount 
} from '../services/sessionManager.js';
import { config } from '../config.js';

/**
 * Register API routes with Fastify
 * @param {FastifyInstance} fastify - Fastify instance
 */
export async function apiRoutes(fastify) {
  
  // List all sessions
  fastify.get('/api/sessions', async (request, reply) => {
    const sessions = getAllSessions();
    return sessions;
  });

  // Create new session
  fastify.post('/api/sessions', async (request, reply) => {
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
      if (err.message.includes('Maximum sessions')) {
        reply.code(409);
        return { error: err.message };
      }
      throw err;
    }
  });

  // Get single session
  fastify.get('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const session = getSession(id);
    
    if (!session) {
      reply.code(404);
      return { error: 'Session not found' };
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
  fastify.delete('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = deleteSession(id);
    
    if (!deleted) {
      reply.code(404);
      return { error: 'Session not found' };
    }
    
    return { success: true, id };
  });

  // Session count (useful for checking limits)
  fastify.get('/api/sessions/count', async (request, reply) => {
    return { 
      count: getSessionCount(),
      max: config.maxSessions
    };
  });
}
