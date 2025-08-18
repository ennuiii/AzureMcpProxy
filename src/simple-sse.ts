import express, { Request, Response } from 'express';
import { Server as HttpServer } from 'http';
import { AzureDevOpsServer } from './server';
import * as azdev from 'azure-devops-node-api';

export class SimpleSSEManager {
  private app: express.Application;
  private server: HttpServer | null = null;
  private azureServer: AzureDevOpsServer;
  private azureConnection: azdev.WebApi | null = null;
  private port: number;
  private host: string;

  constructor(azureServer: AzureDevOpsServer, port: number = 3000, host: string = '0.0.0.0') {
    this.azureServer = azureServer;
    this.port = port;
    this.host = host;
    this.app = express();
    this.initializeAzureConnection();
    this.setupRoutes();
  }

  private initializeAzureConnection(): void {
    // Get config from environment
    const orgUrl = process.env.AZURE_DEVOPS_ORG_URL || '';
    const pat = process.env.AZURE_DEVOPS_PAT || '';
    
    if (orgUrl && pat) {
      const authHandler = azdev.getPersonalAccessTokenHandler(pat);
      this.azureConnection = new azdev.WebApi(orgUrl, authHandler);
      console.log('🔗 Azure DevOps connection initialized');
    }
  }

  private async getWorkItemDirect(workItemId: number): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const witApi = await this.azureConnection.getWorkItemTrackingApi();
      const workItem = await witApi.getWorkItem(workItemId);

      if (!workItem) {
        return `Work item ${workItemId} not found.`;
      }

      const fields = workItem.fields || {};
      const formattedWorkItem = {
        id: workItem.id,
        title: fields['System.Title'],
        state: fields['System.State'],
        type: fields['System.WorkItemType'],
        assignedTo: fields['System.AssignedTo']?.displayName,
        iterationPath: fields['System.IterationPath'],
        tags: fields['System.Tags'],
      };

      return `# Work Item ${formattedWorkItem.id}: ${formattedWorkItem.title}\n\n` +
             `**Type**: ${formattedWorkItem.type}\n` +
             `**State**: ${formattedWorkItem.state}\n` +
             `**Assigned To**: ${formattedWorkItem.assignedTo || 'Unassigned'}\n` +
             `**Iteration**: ${formattedWorkItem.iterationPath}\n` +
             `**Tags**: ${formattedWorkItem.tags || 'None'}\n`;
    } catch (error) {
      console.error('❌ Error getting work item:', error);
      throw new Error(`Failed to get work item ${workItemId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setupRoutes(): void {
    // Request logging middleware
    this.app.use((req: Request, res: Response, next) => {
      const timestamp = new Date().toISOString();
      console.log(`🌐 [${timestamp}] ${req.method} ${req.url}`);
      console.log(`📍 Client IP: ${req.ip || req.connection.remoteAddress}`);
      console.log(`🔧 User-Agent: ${req.get('User-Agent')}`);
      next();
    });

    // Enable CORS for all origins
    this.app.use((req: Request, res: Response, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        console.log('✅ CORS preflight request handled');
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      console.log('🏥 Health check requested');
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'azure-devops-mcp-simple'
      });
    });

    // SSE endpoint for MCP communication
    this.app.get('/sse', (req: Request, res: Response) => {
      console.log('📡 SSE connection requested');
      
      // Set comprehensive SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      // Generate session ID
      const sessionId = Math.random().toString(36).substring(2) + '-' + Date.now().toString(36);
      console.log(`🎬 SSE connection established with session: ${sessionId}`);

      // Send initial connection info
      res.write(`event: endpoint\n`);
      res.write(`data: /message?sessionId=${sessionId}\n\n`);

      // Send hello message
      const helloMessage = {
        jsonrpc: '2.0',
        method: 'hello',
        params: {
          sessionId: sessionId,
          serverName: 'azure-devops-mcp-simple',
          serverVersion: '1.0.0'
        },
        id: `hello-${Date.now()}`
      };
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(helloMessage)}\n\n`);

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          res.write(`: heartbeat ${Date.now()}\n\n`);
        } catch (error) {
          console.log('💔 Heartbeat failed, client disconnected');
          clearInterval(heartbeat);
        }
      }, 30000);

      // Handle client disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
        console.log(`🔌 SSE client disconnected: ${sessionId}`);
      });
    });

    // POST /sse endpoint for MCP JSON-RPC requests (Tobit style)
    this.app.post('/sse', express.json(), async (req: Request, res: Response) => {
      console.log('📨 MCP JSON-RPC Request received on POST /sse');
      console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
      
      try {
        const mcpRequest = req.body;
        
        if (!mcpRequest || !mcpRequest.jsonrpc || !mcpRequest.method) {
          console.log('❌ Invalid MCP request format');
          return res.status(400).json({
            jsonrpc: '2.0',
            id: mcpRequest?.id || null,
            error: {
              code: -32600,
              message: 'Invalid Request'
            }
          });
        }

        console.log(`🔧 Processing MCP method: ${mcpRequest.method}`);
        
        let response;
        
        if (mcpRequest.method === 'initialize') {
          // Initialize response
          response = {
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: 'azure-devops-mcp-simple',
                version: '1.0.0'
              }
            }
          };
        } else if (mcpRequest.method === 'tools/list') {
          // Tools list response
          response = {
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: {
              tools: [
                {
                  name: 'get_work_item',
                  description: 'Get a work item by ID',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      workItemId: { type: 'number', description: 'Work item ID' }
                    },
                    required: ['workItemId']
                  }
                }
              ]
            }
          };
        } else if (mcpRequest.method === 'tools/call') {
          // Handle tool calls
          console.log(`🎯 Tool call: ${mcpRequest.params?.name} with args:`, mcpRequest.params?.arguments);
          
          try {
            // Direct Azure DevOps API call for get_work_item
            if (mcpRequest.params?.name === 'get_work_item') {
              const workItemId = mcpRequest.params?.arguments?.workItemId;
              if (!workItemId) {
                throw new Error('workItemId is required');
              }
              
              // Make direct Azure DevOps API call
              const result = await this.getWorkItemDirect(workItemId);
              response = {
                jsonrpc: '2.0',
                id: mcpRequest.id,
                result: {
                  content: [{
                    type: 'text',
                    text: result
                  }]
                }
              };
            } else {
              throw new Error(`Tool ${mcpRequest.params?.name} not supported`);
            }
          } catch (error) {
            console.error('❌ Error executing tool:', error);
            response = {
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32603,
                message: 'Internal error executing tool',
                data: error instanceof Error ? error.message : String(error)
              }
            };
          }
        } else if (mcpRequest.method === 'notifications/initialized') {
          // Handle initialized notification
          console.log('🎬 Client initialized notification received');
          response = {
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: {}
          };
        } else {
          response = {
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          };
        }

        console.log('📤 MCP Response:', JSON.stringify(response, null, 2));
        res.json(response);
        
      } catch (error) {
        console.error('❌ Error processing MCP request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: 'Internal error'
          }
        });
      }
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'Azure DevOps MCP Server (Simple)',
        endpoints: {
          health: '/health',
          sse: '/sse'
        },
        tools: ['get_work_item'],
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          console.log(`✅ Simple SSE Manager listening on ${this.host}:${this.port}`);
          resolve();
        });

        this.server.on('error', (error: any) => {
          console.error('❌ Simple SSE Manager error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('🛑 Simple SSE Manager stopped');
          resolve();
        });
      });
    }
  }
}