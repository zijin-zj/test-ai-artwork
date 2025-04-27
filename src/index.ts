#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema, ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError, TextContent } from "@modelcontextprotocol/sdk/types.js";
import axios, { formToJSON } from "axios";
import dotenv from "dotenv";
import { isJsonLike } from "redoc";

dotenv.config();

// 无界AI配置
const WUJIE_API_CONFIG = {
    BASE_URL: 'https://pref-gate.wujieai.com',
    ENDPOINTS: {
        CREATE_TASK: '/wj-open/v2/ai/create',
        QUERY_TASK: '/wj-open/v2/ai/info'
    },
    API_KEY: process.env.WUJIE_API_KEY,
    DEFAULT_PARAMS: {
        model: 1018,            // 默认模型
        num: 1,                 // 生成数量
        init_image_url: ""      // 底图URL
    }
};

// 任务状态缓存（实际生产环境建议使用持久化存储）
interface ArtworkTask {
    taskKey: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createTime: number;
    resultUrl?: string;
}

class WujieMcpServer {
    server;
    wujieAxios;
    // taskCache = new Map<string, ArtworkTask>();

    constructor() {
        this.server = new Server({
            name: "wujie-ai-server",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {}  // 只保留工具能力
            }
        });

        this.wujieAxios = axios.create({
            baseURL: WUJIE_API_CONFIG.BASE_URL,
            headers: {
                'Authorization': `Bearer ${WUJIE_API_CONFIG.API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        this.setupHandlers();
        this.setupErrorHandling();
    }

    private setupHandlers() {
        // 工具列表
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                this.createArtworkTool(),
                this.queryArtworkTool()
            ]
        }));

        // 工具处理器
        this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
            switch (req.params.name) {
                case 'create_artwork':
                    return this.handleCreateArtwork(req);
                case 'query_artwork':
                    return this.handleQueryArtwork(req);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${req.params.name}`);
            }
        });
    }

    // 创建作画工具定义
    private createArtworkTool() {
        return {
            name: "create_artwork",
            description: "创建异步AI作画任务，返回任务ID用于查询进度(生成图片服务)",
            inputSchema: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "作画描述，建议包含风格和细节"
                    },
                    width: {
                        type: "number",
                        enum: [512, 768, 1024],
                        default: 512
                    },
                    height: {
                        type: "number",
                        enum: [512, 768, 1024],
                        default: 512
                    },
                    uc_prompt: {
                        type: "string",
                        description: "可选，作画负面描述，补充不需要在图片里看到的内容"
                    }
                },
                required: ["prompt"]
            }
        };
    }

    // 查询作画工具定义
    private queryArtworkTool() {
        return {
            name: "query_artwork",
            description: "查询作画任务进度及结果",
            inputSchema: {
                type: "object",
                properties: {
                    key: {
                        type: "string",
                        description: "创建任务时返回的任务ID"
                    }
                },
                required: ["key"]
            }
        };
    }

    // 处理创建请求
    private async handleCreateArtwork(request: any) {
        const params = request.params.arguments;
        
        // 调用无界创建接口
        console.log("API_KEY=" + WUJIE_API_CONFIG.API_KEY)
        const response = await this.wujieAxios.post(WUJIE_API_CONFIG.ENDPOINTS.CREATE_TASK, {
            prompt: params.prompt,
            width: params.width || 512,
            height: params.height || 512,
            ...WUJIE_API_CONFIG.DEFAULT_PARAMS
        });

        const code = response.data.code
        if (code != 200) {
            throw new McpError(ErrorCode.InternalError, "创建任务失败：" + response.data.message);
        }
        
        // 解析响应
        const taskKey = response.data.data?.results?.[0]?.key;
        if (!taskKey) throw new McpError(ErrorCode.InternalError, "创建任务失败，返回任务key为空");

        // // 记录任务状态
        // this.taskCache.set(taskKey, {
        //     taskKey,
        //     status: 'pending',
        //     createTime: Date.now()
        // });

        // 返回任务ID
        return {
            content: [{
                type: "text",
                text: `任务已创建！使用此key查询进度：${taskKey}`
            }]
        };
    }


    // 处理查询请求
    private async handleQueryArtwork(request: any) {
        const argument = request.params.arguments;
        
        console.log("argument=" + argument)

        if (argument === undefined) {
            throw new McpError(ErrorCode.InvalidParams, "查询参数key不能为空"+JSON.stringify(argument));
        }

        // 调用无界查询接口
        const response = await this.wujieAxios.get(WUJIE_API_CONFIG.ENDPOINTS.QUERY_TASK + "?key=" + argument.key);

        const code = response.data.code
        if (code != 200) {
            throw new McpError(ErrorCode.InternalError, "查询作画结果失败：" + response.data.message);
        }

        const taskData = response.data.data;
        
        // 构建状态消息
        let statusMessage;
        switch (taskData.status) {
            case 0:
            case 1:
            case 11:
                statusMessage = `正在排队中...`;
                break;
            case 2:
                statusMessage = `正在生成中...`;
                break;
            case 4:
                statusMessage = `✅ 生成完成！[查看图片](${taskData.picture_url})`;
                break;
            case -1:
                statusMessage = `作画提交已撤销`;
            case 3:
            case 12:
                statusMessage = `❌ 生成失败：${taskData.failMessage.failMessage || '未知错误'}`;
                break;
            default:
                statusMessage = "未知状态";
        }

        return {
            content: [{
                type: "text",
                text: `任务状态：${statusMessage}\n消耗积分：${taskData.integral_cost}`
            }]
        };
    }

    // 错误处理（与示例保持相同结构）
    private setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error("[MCP Error]", error);
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log("无界AI MCP服务已启动");
    }
}

// 启动服务
new WujieMcpServer().run().catch(console.error);