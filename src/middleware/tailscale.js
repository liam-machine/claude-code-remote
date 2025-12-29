/**
 * Tailscale IP verification middleware
 * Only allows requests from Tailscale CGNAT range (100.64.0.0/10)
 */

// Tailscale uses CGNAT range 100.64.0.0/10
// This covers 100.64.0.0 - 100.127.255.255
const TAILSCALE_CIDR_START = 0x64400000; // 100.64.0.0
const TAILSCALE_CIDR_MASK = 0xffc00000; // /10 mask

/**
 * Convert IPv4 address string to 32-bit integer
 * @param {string} ip - IPv4 address (e.g., "100.78.245.18")
 * @returns {number|null} 32-bit integer or null if invalid
 */
function ipToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0; // Convert to unsigned
}

/**
 * Check if IP is in Tailscale CGNAT range
 * @param {string} ip - IPv4 address
 * @returns {boolean}
 */
export function isTailscaleIP(ip) {
  // Handle IPv6-mapped IPv4 addresses (::ffff:100.78.245.18)
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;

  return (ipInt & TAILSCALE_CIDR_MASK) === TAILSCALE_CIDR_START;
}

/**
 * Fastify hook to verify Tailscale IP
 * Rejects non-Tailscale requests with 403 Forbidden
 */
export async function tailscaleVerify(request, reply) {
  // Get client IP - Fastify provides this via request.ip
  const clientIP = request.ip;

  if (!isTailscaleIP(clientIP)) {
    request.log.warn({ clientIP }, "Rejected non-Tailscale IP");
    return reply.code(403).send({
      error: "Forbidden",
      message: "Access restricted to Tailscale network",
    });
  }

  request.log.debug({ clientIP }, "Tailscale IP verified");
}
