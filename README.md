### 无界AI生图的MCP服务集成指南

------

#### 一、服务核心功能

1. **AI图像生成**：通过MCP协议，可调用无界AI数十种模型生成图像
2. **模型信息列表**：可查看无界AI数十种作画生图模型介绍
3. **多分辨率支持**：支持512~4094主流尺寸的任意宽高组合
4. **参数自定义**：可调节采样步数、采样器类型、提示词相关性等专业参数

------

#### 二、快速接入流程

**步骤1：获取API密钥**

1. 访问无界AI控制台
2. 注册/登录后进入「开发者中心」
3. 在「密钥管理」模块创建新密钥
4. 记录生成的`WUJIEAI_API_KEY`

**步骤2 ：环境准备**

```bash
# 验证Node.js环境（要求v18.0.0或更高版本）
node -v
```

**步骤3：Server服务配置**

```javascript
# 本地客户端（推荐）
{
  "mcpServers": {
    "mcp-server-wujieai": {
      "command": "npx",
      "args": ["-y", "wujieai-mcp-server"],
  	  "env": {
        "WUJIEAI_API_KEY": ${YOUR_API_KEY}
      }
    }
  }
}

# HTTP SSE长连接
{
  "mcpServers": {
    "wujie-ai-sse": {
      "url": "https://pref-gate.wujieai.com/open-platform-mcp/sse?key=${YOUR_API_KEY}"
    }
  }
}
```

------

#### 三、开发调用示例

```python
const result = await client.callTool({
  name: "generate_image",
  arguments: {
    prompt: "一只优雅地坐着的猫",
    model: "1013"
  }
});
```

------

#### 四、最佳实践建议

1. **提示词优化**：
   - 使用权重标记符`( )`强化关键元素：`(neon lights:1.3)`

------

#### 五、技术支持

- 官方创作中心：https://www.wujieai.cc
- 官方文档中心：https://apifox.com/apidoc/shared/ecc069df-a9d5-4c86-b723-6dcd5cc79f81
- 开发者交流钉钉群：https://cdn.wujiebantu.com/openapi/WechatIMG491.jpg

------

> 注：具体API参数请以最新版文档为准。建议通过`npm update @wujieai/wujieai-mcp-server`保持SDK版本同步更新。

