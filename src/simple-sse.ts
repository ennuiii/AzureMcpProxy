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

  private async listProjectsDirect(): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const coreApi = await this.azureConnection.getCoreApi();
      const projects = await coreApi.getProjects();

      if (!projects || projects.length === 0) {
        return 'No projects found.';
      }

      const projectList = projects.map((project: any) => {
        return `- **${project.name}**: ${project.description || 'No description'} (ID: ${project.id})`;
      }).join('\n');

      return `# Projects (${projects.length})\n\n${projectList}`;
    } catch (error) {
      console.error('❌ Error listing projects:', error);
      throw new Error(`Failed to list projects: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getProjectDirect(projectId: string): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const coreApi = await this.azureConnection.getCoreApi();
      const project = await coreApi.getProject(projectId);

      if (!project) {
        return `Project ${projectId} not found.`;
      }

      return `# Project: ${project.name}\n\n` +
             `**ID**: ${project.id}\n` +
             `**Description**: ${project.description || 'No description'}\n` +
             `**State**: ${project.state}\n` +
             `**Visibility**: ${project.visibility}\n` +
             `**URL**: ${project.url}`;
    } catch (error) {
      console.error('❌ Error getting project:', error);
      throw new Error(`Failed to get project ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createWorkItemDirect(project: string, type: string, title: string, description?: string, assignedTo?: string): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const witApi = await this.azureConnection.getWorkItemTrackingApi();
      
      const patchDocument = [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: title
        }
      ];

      if (description) {
        patchDocument.push({
          op: 'add',
          path: '/fields/System.Description',
          value: description
        });
      }

      if (assignedTo) {
        patchDocument.push({
          op: 'add',
          path: '/fields/System.AssignedTo',
          value: assignedTo
        });
      }

      const workItem = await witApi.createWorkItem(
        null,
        patchDocument as any,
        project,
        type
      );

      if (!workItem) {
        throw new Error('Failed to create work item');
      }

      return `# Work Item Created: ${workItem.id}\n\n` +
             `**Title**: ${title}\n` +
             `**Type**: ${type}\n` +
             `**Project**: ${project}\n` +
             `**State**: ${workItem.fields?.['System.State']}\n` +
             `**URL**: ${workItem._links?.html?.href || 'N/A'}`;
    } catch (error) {
      console.error('❌ Error creating work item:', error);
      throw new Error(`Failed to create work item: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async queryWorkItemsDirect(wiql: string, project?: string): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const witApi = await this.azureConnection.getWorkItemTrackingApi();
      const queryResult = await witApi.queryByWiql({ query: wiql });

      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return 'No work items found matching the query.';
      }

      const workItemIds = queryResult.workItems.map(wi => wi.id);
      const workItems = await witApi.getWorkItems(workItemIds);

      const formattedItems = workItems.map((item: any) => {
        const fields = item.fields || {};
        return `- **${item.id}**: ${fields['System.Title']} (${fields['System.State']})`;
      }).join('\n');

      return `# Query Results (${workItems.length} items)\n\n${formattedItems}`;
    } catch (error) {
      console.error('❌ Error querying work items:', error);
      throw new Error(`Failed to query work items: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listRepositoriesDirect(project?: string): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const gitApi = await this.azureConnection.getGitApi();
      const repositories = await gitApi.getRepositories(project);

      if (!repositories || repositories.length === 0) {
        return 'No repositories found.';
      }

      const repoList = repositories.map((repo: any) => {
        return `- **${repo.name}**: ${repo.defaultBranch || 'No default branch'} (ID: ${repo.id})`;
      }).join('\n');

      return `# Repositories (${repositories.length})\n\n${repoList}`;
    } catch (error) {
      console.error('❌ Error listing repositories:', error);
      throw new Error(`Failed to list repositories: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getRepositoryDirect(repositoryId: string, project?: string): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      const gitApi = await this.azureConnection.getGitApi();
      const repository = await gitApi.getRepository(repositoryId, project);

      if (!repository) {
        return `Repository ${repositoryId} not found.`;
      }

      return `# Repository: ${repository.name}\n\n` +
             `**ID**: ${repository.id}\n` +
             `**Default Branch**: ${repository.defaultBranch || 'Not set'}\n` +
             `**Size**: ${repository.size || 'Unknown'} bytes\n` +
             `**URL**: ${repository.webUrl || repository.remoteUrl || 'N/A'}\n` +
             `**Project**: ${repository.project?.name || 'Unknown'}`;
    } catch (error) {
      console.error('❌ Error getting repository:', error);
      throw new Error(`Failed to get repository ${repositoryId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async searchRepositoryCodeDirect(searchText: string, project?: string, repository?: string): Promise<string> {
    if (!this.azureConnection) {
      throw new Error('Azure DevOps connection not initialized');
    }

    try {
      // Note: Azure DevOps Node API doesn't have a search API exposed
      // This would require using the REST API directly
      // For now, returning a placeholder message
      return `Code search functionality requires direct REST API implementation.\n` +
             `Search text: "${searchText}"\n` +
             `Project: ${project || 'All projects'}\n` +
             `Repository: ${repository || 'All repositories'}\n\n` +
             `Note: The Azure DevOps Node API doesn't expose the Search API directly. ` +
             `To implement this, you would need to make direct REST API calls to:\n` +
             `POST https://almsearch.dev.azure.com/{organization}/{project}/_apis/search/codesearchresults?api-version=7.1`;
    } catch (error) {
      console.error('❌ Error searching repository code:', error);
      throw new Error(`Failed to search repository code: ${error instanceof Error ? error.message : String(error)}`);
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
        
        if (!mcpRequest || !mcpRequest.jsonrpc) {
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
        
        // Handle error responses from client (Tobit sometimes sends these)
        if (mcpRequest.error) {
          console.log('⚠️ Client sent error response:', mcpRequest.error);
          // Acknowledge the error
          return res.json({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: { acknowledged: true }
          });
        }
        
        if (!mcpRequest.method) {
          console.log('❌ Missing method in MCP request');
          return res.status(400).json({
            jsonrpc: '2.0',
            id: mcpRequest?.id || null,
            error: {
              code: -32600,
              message: 'Missing method'
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
                tools: {},
                transport: {
                  name: 'streamable-https',
                  supported: true
                }
              },
              serverInfo: {
                name: 'azure-devops-mcp-simple',
                version: '1.0.0',
                transport: 'streamable-https'
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
                },
                {
                  name: 'list_projects',
                  description: 'List all projects in Azure DevOps',
                  inputSchema: {
                    type: 'object',
                    properties: {}
                  }
                },
                {
                  name: 'get_project',
                  description: 'Get details of a specific project',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      projectId: { type: 'string', description: 'Project ID or name' }
                    },
                    required: ['projectId']
                  }
                },
                {
                  name: 'create_work_item',
                  description: 'Create a new work item',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      project: { type: 'string', description: 'Project name or ID' },
                      type: { type: 'string', description: 'Work item type (e.g., Task, Bug, User Story)' },
                      title: { type: 'string', description: 'Work item title' },
                      description: { type: 'string', description: 'Work item description (optional)' },
                      assignedTo: { type: 'string', description: 'Assigned to user email (optional)' }
                    },
                    required: ['project', 'type', 'title']
                  }
                },
                {
                  name: 'query_work_items',
                  description: 'Query work items using WIQL',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      wiql: { type: 'string', description: 'WIQL query string' },
                      project: { type: 'string', description: 'Project name or ID (optional)' }
                    },
                    required: ['wiql']
                  }
                },
                {
                  name: 'list_repositories',
                  description: 'List all repositories',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      project: { type: 'string', description: 'Project name or ID (optional)' }
                    }
                  }
                },
                {
                  name: 'get_repository',
                  description: 'Get details of a specific repository',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      repositoryId: { type: 'string', description: 'Repository ID or name' },
                      project: { type: 'string', description: 'Project name or ID (optional)' }
                    },
                    required: ['repositoryId']
                  }
                },
                {
                  name: 'search_repository_code',
                  description: 'Search for code in repositories',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      searchText: { type: 'string', description: 'Search text' },
                      project: { type: 'string', description: 'Project name or ID (optional)' },
                      repository: { type: 'string', description: 'Repository name or ID (optional)' }
                    },
                    required: ['searchText']
                  }
                }
              ]
            }
          };
        } else if (mcpRequest.method === 'tools/call') {
          // Handle tool calls
          console.log(`🎯 Tool call: ${mcpRequest.params?.name} with args:`, mcpRequest.params?.arguments);
          
          try {
            let result: string;
            const toolName = mcpRequest.params?.name;
            const args = mcpRequest.params?.arguments || {};

            switch (toolName) {
              case 'get_work_item':
                if (!args.workItemId) {
                  throw new Error('workItemId is required');
                }
                result = await this.getWorkItemDirect(args.workItemId);
                break;

              case 'list_projects':
                result = await this.listProjectsDirect();
                break;

              case 'get_project':
                if (!args.projectId) {
                  throw new Error('projectId is required');
                }
                result = await this.getProjectDirect(args.projectId);
                break;

              case 'create_work_item':
                if (!args.project || !args.type || !args.title) {
                  throw new Error('project, type, and title are required');
                }
                result = await this.createWorkItemDirect(
                  args.project,
                  args.type,
                  args.title,
                  args.description,
                  args.assignedTo
                );
                break;

              case 'query_work_items':
                if (!args.wiql) {
                  throw new Error('wiql is required');
                }
                result = await this.queryWorkItemsDirect(args.wiql, args.project);
                break;

              case 'list_repositories':
                result = await this.listRepositoriesDirect(args.project);
                break;

              case 'get_repository':
                if (!args.repositoryId) {
                  throw new Error('repositoryId is required');
                }
                result = await this.getRepositoryDirect(args.repositoryId, args.project);
                break;

              case 'search_repository_code':
                if (!args.searchText) {
                  throw new Error('searchText is required');
                }
                result = await this.searchRepositoryCodeDirect(
                  args.searchText,
                  args.project,
                  args.repository
                );
                break;

              default:
                throw new Error(`Tool ${toolName} not supported`);
            }

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
        } else if (mcpRequest.method === 'ping') {
          // Handle ping requests
          console.log('🏓 Ping request received');
          response = {
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: {
              timestamp: new Date().toISOString()
            }
          };
        } else if (mcpRequest.method === 'hello') {
          // Handle hello requests
          console.log('👋 Hello request received');
          response = {
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: {
              serverName: 'azure-devops-mcp-simple',
              serverVersion: '1.0.0',
              transport: 'streamable-https'
            }
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
        tools: [
          'get_work_item',
          'list_projects',
          'get_project', 
          'create_work_item',
          'query_work_items',
          'list_repositories',
          'get_repository',
          'search_repository_code'
        ],
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