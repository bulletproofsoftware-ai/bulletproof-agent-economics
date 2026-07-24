// =============================================================================
// src/api/websocket.ts — Real-time event stream via WebSocket
// REQ-053: WebSocket with <=2s lag
// CISO: Auth via Bearer token in upgrade request, NOT query string
// =============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { WSMessage, WSSubscribe } from '../types.js';
import type { AuthPayload } from './middleware/auth.js';

interface ConnectedClient {
  ws: WebSocket;
  user: AuthPayload;
  filters: {
    projects: Set<string>;
    agents: Set<string>;
  };
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Set<ConnectedClient> = new Set();

  /**
   * Attach WebSocket server to an existing HTTP server.
   * WebSocket path: /economics/stream
   */
  attach(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/economics/stream',
      verifyClient: (info, callback) => {
        this.verifyClient(info.req, callback);
      },
    });

    this.wss.on('connection', (ws, req) => {
      const user = (req as IncomingMessage & { user?: AuthPayload }).user;
      if (!user) {
        ws.close(4001, 'Authentication required');
        return;
      }

      const client: ConnectedClient = {
        ws,
        user,
        filters: { projects: new Set(), agents: new Set() },
      };

      this.clients.add(client);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as WSSubscribe;
          if (msg.type === 'subscribe') {
            if (msg.projects) {
              client.filters.projects = new Set(msg.projects);
            }
            if (msg.agents) {
              client.filters.agents = new Set(msg.agents);
            }
          }
        } catch {
          // Invalid message — ignore
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });

      ws.on('error', () => {
        this.clients.delete(client);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        data: { message: 'Connected to economics stream', user: user.sub },
      }));
    });
  }

  /**
   * Verify WebSocket upgrade request.
   * Auth via Bearer token in Authorization header (NOT query string per CISO).
   */
  private verifyClient(
    req: IncomingMessage,
    callback: (result: boolean, code?: number, message?: string) => void,
  ): void {
    // Skip auth if no JWT secret configured (development mode)
    if (!config.jwtSecret) {
      (req as IncomingMessage & { user?: AuthPayload }).user = {
        sub: 'dev-user',
        role: 'admin',
        iss: config.jwtIssuer,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      callback(true);
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      callback(false, 401, 'Missing Authorization header');
      return;
    }

    const token = authHeader.slice(7);

    try {
      // Match the REST middleware: honor ECONOMICS_JWT_MAX_AGE="disabled" for long-lived
      // service tokens. When unset/set to anything else, that value (default '1h') applies.
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: ['HS256'],
        issuer: config.jwtIssuer,
      };
      if (config.jwtMaxAge && config.jwtMaxAge.toLowerCase() !== 'disabled') {
        verifyOptions.maxAge = config.jwtMaxAge;
      }
      const decoded = jwt.verify(token, config.jwtSecret, verifyOptions) as AuthPayload;

      (req as IncomingMessage & { user?: AuthPayload }).user = decoded;
      callback(true);
    } catch {
      callback(false, 401, 'Invalid token');
    }
  }

  /**
   * Broadcast a message to all connected clients that match filters.
   */
  broadcast(message: WSMessage, projectId?: string, agentId?: string): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      // Check filters
      if (projectId && client.filters.projects.size > 0) {
        if (!client.filters.projects.has(projectId)) continue;
      }
      if (agentId && client.filters.agents.size > 0) {
        if (!client.filters.agents.has(agentId)) continue;
      }

      client.ws.send(payload);
    }
  }

  /**
   * Get the number of connected clients.
   */
  get connectionCount(): number {
    return this.clients.size;
  }

  /**
   * Close all connections.
   */
  close(): void {
    for (const client of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
