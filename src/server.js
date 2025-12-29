import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "path";
import { config } from "./config.js";
import { tailscaleVerify } from "./middleware/tailscale.js";
import { apiRoutes } from "./routes/api.js";
import { initWebSocket } from "./routes/ws.js";

const fastify = Fastify({
  logger: true,
  // Trust proxy to get correct client IP if behind reverse proxy
  trustProxy: true,
});

// Tailscale IP verification on all requests
fastify.addHook("onRequest", tailscaleVerify);

// Register API routes
fastify.register(apiRoutes);

// Serve static files from public directory
fastify.register(fastifyStatic, {
  root: join(config.projectRoot, "public"),
  prefix: "/",
});

// Health check endpoint
fastify.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
    console.log("Listening on port", config.port);
    
    // Initialize WebSocket server after Fastify is listening
    initWebSocket(fastify.server);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
