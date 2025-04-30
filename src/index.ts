#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosResponse } from "axios";
import dotenv from "dotenv";
import { ApiResponse, GenerateImageResult, GenerateTaskInfo, ModelInfo } from "./types.js";

dotenv.config();

function getApiKey() {
    const apiKey = process.env.WUJIEAI_API_KEY;
    if (!apiKey) {
        console.error("WUJIEAI_API_KEY environment variable is not set");
        process.exit(1);
    }
    return apiKey;
}

// 无界AI配置
const WUJIEAI_API_CONFIG = {
    BASE_URL: 'https://pref-gate.wujieai.com',
    ENDPOINTS: {
        CREATE_TASK: '/wj-open/v2/ai/create',
        QUERY_TASK: '/wj-open/v2/ai/info',
        QUERY_MODEL_LIST: '/wj-open/v2/ai/model_base_infos'
    },
    API_KEY: getApiKey(),
    DEFAULT_PARAMS: {
        model: 1013,                // 模型code，默认通用FLUX模型
        num: 1,                     // 生成数量
        width: 512,                 // 图片宽
        height: 512,                // 图片高
        uc_prompt: "",              // 负面描述词
        init_image_url: "",         // 底图url
        steps: 20,                  // 采样步数（sampling steps），默认20
        cfg: 7,                     // 提示词相关性（CFG scale），取值范围[1-30]，默认值7。
        sampler_index: 0,           // 采样模式（Sampler）是指扩散去噪算法的采样模式，如果设置正确，它们会发散并最终收敛。
        seed: -1                    // 随机种子，生成图片的seed，默认-1随机生成。
    },
    POLL_TIMEOUT: 30000
};


class WujieAiMcpServer {
    server;
    wujieaiAxios;

    constructor() {
        this.server = new Server({
            name: "wujie-ai-mcp-server",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {}
            }
        });

        this.wujieaiAxios = axios.create({
            baseURL: WUJIEAI_API_CONFIG.BASE_URL,
            headers: {
                'Authorization': `Bearer ${WUJIEAI_API_CONFIG.API_KEY}`,
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
                this.generateImageTool(),
                this.queryGenerateTaskTool(),
                this.queryModelInfoListTool()
            ]
        }));

        // 工具处理器
        this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
            switch (req.params.name) {
                case 'generate_image':
                    return this.handleGenerateImage(req);
                case 'query_generate_task':
                    return this.handleQueryGenerateTask(req);
                case 'query_model_infos':
                    return this.handleQueryModelInfos(req);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${req.params.name}`);
            }
        });
    }

    private generateImageTool() {
        return {
            name: "generate_image",
            description: "AI生成图片",
            inputSchema: {
                type: "object",
                properties: {
                    model: {
                        type: "string",
                        description: "模型code，默认通用FLUX模型",
                        default: 1013
                    },
                    num: {
                        type: "number",
                        description: "生成数量，默认1张",
                        default: 1
                    },
                    prompt: {
                        type: "string",
                        description: "作画描述，建议包含风格和细节"
                    },
                    uc_prompt: {
                        type: "string",
                        description: "作画负面描述。（可选）"
                    },
                    width: {
                        type: "number",
                        enum: [512, 768, 1024, 1360],
                        default: 512,
                        description: "图片宽，默认512。（可选）",
                    },
                    height: {
                        type: "number",
                        enum: [512, 768, 1024, 1360],
                        default: 512,
                        description: "图片高，默认512。（可选）",
                    },
                    init_image_url: {
                        type: "string",
                        default: "",
                        description: "底图url。（可选）"
                    },
                    steps: {
                        type: "number",
                        default: 20,
                        description: "采样步数，默认20。（可选）"
                    },
                    cfg: {
                        type: "number",
                        default: 7,
                        description: "提示词相关性，取值范围[1-30]，默认值7。（可选）"
                    },
                    sampler_index: {
                        type: "number",
                        default: 20,
                        description: "采样模式是指扩散去噪算法的采样模式。（可选）"
                    },
                    seed: {
                        type: "string",
                        default: "-1",
                        description: "随机种子，生成图片的seed，默认-1随机生成。（可选）"
                    },
                },
                required: ["prompt"]
            }
        };
    }

    private queryGenerateTaskTool() {
        return {
            name: "query_generate_task",
            description: "查询作画任务结果",
            inputSchema: {
                type: "object",
                properties: {
                    key: {
                        type: "string",
                        description: "发起作画返回的任务key"
                    }
                },
                required: ["key"]
            }
        };
    }

    private queryModelInfoListTool() {
        return {
            name: "query_model_infos",
            description: "查询作画模型信息列表",
            inputSchema: {
                type: "object",
                properties: {}
            }
        }
    }

    private async handleGenerateImage(request: any) {
        const params = request.params.arguments;

        const defaultParams = WUJIEAI_API_CONFIG.DEFAULT_PARAMS;

        // 调用发起作画接口
        const response = await this.wujieaiAxios.post(WUJIEAI_API_CONFIG.ENDPOINTS.CREATE_TASK, {
            model: params.model || defaultParams.model,
            prompt: params.prompt,
            uc_prompt: params.uc_prompt,
            num: params.num || defaultParams.num,
            width: params.width || defaultParams.width,
            height: params.height || defaultParams.height,
            init_image_url: params.init_image_url || defaultParams.init_image_url,
            steps: params.steps || defaultParams.steps,
            sampler_index: params.sampler_index || defaultParams.sampler_index,
            seed: params.seed || defaultParams.seed
        }) as AxiosResponse<ApiResponse<GenerateImageResult>>;

        const code = response.data.code
        if (code != 200) {
            throw new McpError(ErrorCode.InternalError, "发起作画失败：" + response.data.message);
        }
        
        // 解析响应
        const taskKey = response.data.data?.results?.[0]?.key;
        if (!taskKey) throw new McpError(ErrorCode.InternalError, "发起作画失败，返回任务key为空");

        let taskData;
        const expectedSeconds = response.data.data.results[0].expected_second || 20;
        try {
            // 轮询任务状态
            const taskData = await this.pollTaskStatus(taskKey, expectedSeconds * 1500);
            
            // 返回生成结果
            return {
                content: [{
                    type: "text",
                    text: `✅ 作画成功！\n 作画任务key：${taskKey}\n 展示图片：${taskData.picture_url} \n 消耗积分：${taskData.integral_cost}个`
                }]
            }
        } catch (error) {
            if (error instanceof McpError) throw error;
            throw new McpError(ErrorCode.InternalError, `发起作画异常`);
        }
    }

     /**
     * 轮询查询任务状态
     * 
     * @param taskKey - 任务唯一标识
     * @param timeout - 超时时间（毫秒）
     * @returns 完成的任务数据
     */
     private async pollTaskStatus(taskKey: string, timeout: number): Promise<any> {
        const startTime = Date.now();
        let taskData;

        let pollTimeout = WUJIEAI_API_CONFIG.POLL_TIMEOUT
        const sleepTime = 2000;
        while (Date.now() - startTime < timeout) {
            pollTimeout -= sleepTime;
            if (pollTimeout < 0) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, sleepTime));
           
            // 调用查询作画结果接口
            const result = await this.doQueryGenerateTask(taskKey) as AxiosResponse<ApiResponse<GenerateTaskInfo>>;
            taskData = result.data.data;

            // 成功状态处理
            if (taskData.status === 4) {
                if (taskData.involve_yellow === 0) {
                    return taskData;
                } else {
                    throw new McpError(ErrorCode.InternalError,
                        `生成图片涉嫌违规，请优化描述词后重试`);
                }
            }
            
            // 积分不足
            if (taskData.integral_cost === 0) 
                throw new McpError(ErrorCode.InternalError,
                    `作画失败: ${taskData.integral_cost_message}`);

            // 失败状态处理
            if ([3, 12, -1].includes(taskData.status)) {
                throw new McpError(ErrorCode.InternalError,
                    `作画失败: ${taskData.fail_message?.fail_message || "未知错误"}`);
            }
        }

        throw new McpError(ErrorCode.RequestTimeout, 
            `作画任务key：${taskKey}, 轮询结果超时。作画预估等待时间：${Math.round(timeout/1000)}秒，请稍后重试`);
    }


    private doQueryGenerateTask(taskKey: string) : Promise<AxiosResponse>{
        return this.wujieaiAxios.get(`${WUJIEAI_API_CONFIG.ENDPOINTS.QUERY_TASK}?key=${taskKey}`)
            .then(response => {
                if (response.data.code !== "200") {
                    throw new McpError(
                    ErrorCode.InternalError,
                    `查询作画结果失败：${JSON.stringify(response.data)}`
                    );
                }
                return response;
            })
            .catch(error => {
                throw error; 
            });
    }

    private async handleQueryGenerateTask(request: any) {
        const argument = request.params.arguments;

        if (argument === undefined) {
            throw new McpError(ErrorCode.InvalidParams, "查询任务key不能为空");
        }

        // 调用查询作画详情接口
        const response = await this.doQueryGenerateTask(argument.key) as AxiosResponse<ApiResponse<GenerateTaskInfo>>;

        const taskData = response.data.data;
        
        // 构建状态消息
        let isShowPictureUrl = false;
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
                if (taskData.involve_yellow === 0) {
                    statusMessage = `✅ 作画成功！查看图片：${taskData.picture_url}`;
                    isShowPictureUrl = true;
                } else {
                    statusMessage = `生成图片涉嫌违规，请优化描述词后重试`;
                }
                break;
            case -1:
                statusMessage = `作画提交已撤销`;
            case 3:
            case 12:
                statusMessage = `❌ 作画失败：${taskData.fail_message.fail_message || '未知错误'}`;
                break;
            default:
                statusMessage = "未知状态";
        }

        return {
            content: [{
                type: "text",
                text: `作画任务状态：${statusMessage}\n消耗积分：${taskData.integral_cost}个`
            }]
        };
    }

    private async handleQueryModelInfos(request: any) {
        const response = await this.doQueryModelInfos(request) as AxiosResponse<ApiResponse<ModelInfo[]>>;;
        const code = response.data.code
        if (code != 200) {
            throw new McpError(ErrorCode.InternalError, "查询模型列表失败：" + response.data.message);
        }      

        return {
            content: [
                {
                    type: "text",
                    text: "| 模型code | 模型名称          |\n|----------|------------------|"
                },
                ...response.data.data.map((model: ModelInfo) => ({
                type: "text",
                text: `| ${model.model_code.toString().padEnd(8)} | ${model.model_desc.padEnd(16)} |`
                }))
            ]
          };
    }

    private async doQueryModelInfos(request: any): Promise<AxiosResponse>{
        return this.wujieaiAxios.get(`${WUJIEAI_API_CONFIG.ENDPOINTS.QUERY_MODEL_LIST}`)
            .then(response => {
                if (response.data.code !== "200") {
                    throw new McpError(ErrorCode.InternalError,
                        `查询模型列表失败：${JSON.stringify(response.data)}`
                    );
                }
                return response;
            })
            .catch(error => {
                throw error; 
            });
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
new WujieAiMcpServer().run().catch(console.error);