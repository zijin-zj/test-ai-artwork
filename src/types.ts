export interface ApiResponse<T> {
    code: number;
    message?: string;
    data: T;
}

export interface GenerateImageResult {
    // 作画结果列表
    results: [GenerateImageKeyInfo]
    // 预计总消耗积分数
    expected_integral_cost: number
}

export interface GenerateImageKeyInfo {
    // 作画结果key
    key: string
    // 预计出图等待时间，单位：秒
    expected_second: number
    // 批量任务id，同一次作画请求生成的不同作画拥有相同的batchTaskKey（MJ模型场景）
    batchTask_key: string
}

export interface GenerateTaskInfo {
    // 作画状态（0：已提交、1：排队中、2：生成中、3：生成失败、4：生成成功、-1：已撤销、11：已提交、12：作画失败）
    status: number
    // 图片url
    picture_url: string;
    // 超过20M的图片会有一个压缩版本
    mini_picture_url: string;
    // 进入队列时的时间戳
    generate_time: number;
    // 开始生成的时间戳（仍在排队返回0）
    start_gen_time: number;
    // 完成时间戳(未完成为0)
    complete_time: number;
    // 图片是否涉黄(0或1)
    involve_yellow: number;
    // 作画失败原因
    fail_message: FailMessage;
    // 生成图片的seed
    seed: string
    // 采样模式，根据预设资源填充
    sampler_index: number
    // CFG scale, 提示词相关性。非负，表示AI对描述参数的倾向程度
    cfg: number
    // sampling steps，步数对出图耗时影响较大，暂时仅对部分客户支持。
    steps: number
    // 消耗积分数，包括生成、加速、精绘等
    integral_cost: number
    // 积分消耗提示词
    integral_cost_message: string
    // 所支持的模式，可通过`/ai/default_resource`接口查询具体model所支持的模式
    pattern: string 
    // 预处理方式，用来对预处理图片进行处理
    // INVERT_SCRIBBLE（反色）FAKE_SCRIBBLE（假涂鸦）SCRIBBLE（预处理）NONE（无预处理）
    pretreatment_method: string
}

export interface FailMessage {
    // 作画失败code
    fail_code: number
    // 失败原因
    fail_message: string
}

export interface ModelInfo {
    // 模型code
    model_code: number;
    // 模型描述
    model_desc: string;
}