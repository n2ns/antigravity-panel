
const strategyData = {
    "groups": [
        {
            "id": "gemini-flash",
            "label": "Gemini Flash",
            "shortLabel": "Flash",
            "themeColor": "#40C4FF",
            "prefixes": ["gemini-3-flash", "flash"],
            "models": [
                { "id": "gemini-3-flash", "modelName": "MODEL_PLACEHOLDER_M47", "displayName": "Gemini 3 Flash" }
            ]
        },
        {
            "id": "gemini-pro",
            "label": "Gemini Pro",
            "shortLabel": "Pro",
            "themeColor": "#69F0AE",
            "prefixes": ["gemini"],
            "models": [
                { "id": "gemini-3-pro-high", "modelName": "MODEL_PLACEHOLDER_M37", "displayName": "Gemini 3.1 Pro (High)" },
                { "id": "gemini-3-pro-low", "modelName": "MODEL_PLACEHOLDER_M36", "displayName": "Gemini 3.1 Pro (Low)" }
            ]
        },
        {
            "id": "claude",
            "label": "Claude",
            "shortLabel": "Claude",
            "themeColor": "#FFAB40",
            "prefixes": ["claude"],
            "models": [
                { "id": "claude-4-6-sonnet-thinking", "modelName": "MODEL_PLACEHOLDER_M35", "displayName": "Claude Sonnet 4.6 (Thinking)" },
                { "id": "claude-4-6-opus-thinking", "modelName": "MODEL_PLACEHOLDER_M26", "displayName": "Claude Opus 4.6 (Thinking)" }
            ]
        },
        {
            "id": "gpt",
            "label": "GPT",
            "shortLabel": "GPT",
            "themeColor": "#FF5252",
            "prefixes": ["gpt"],
            "models": [
                { "id": "gpt-oss-120b-medium", "modelName": "MODEL_OPENAI_GPT_OSS_120B_MEDIUM", "displayName": "GPT-OSS 120B" }
            ]
        }
    ]
};

class MockStrategyManager {
    groups = strategyData.groups;

    getGroupForModel(modelId, modelLabel) {
        // Step 1: 通过精确模型定义查找（含 modelName 精确匹配）
        const def = this.getModelDefinition(modelId, modelLabel);
        if (def) {
            const group = this.groups.find(g => g.models.some(m => m.id === def.id));
            if (group) return group;
        }

        // Step 2: 最长前缀优先匹配（与 strategy.ts 对齐）
        const lowerId = modelId.toLowerCase();
        const lowerLabel = modelLabel ? modelLabel.toLowerCase() : '';

        const matches = [];
        for (const group of this.groups) {
            if (!group.prefixes) continue;
            for (const prefix of group.prefixes) {
                const p = prefix.toLowerCase();
                // Flash 保护：gemini-pro 的通用 "gemini" 前缀不得匹配 Flash 模型
                if (group.id === 'gemini-pro' && p === 'gemini') {
                    if (lowerId.includes('flash') || lowerLabel.includes('flash')) continue;
                }
                const inId = lowerId.includes(p);
                const inLabel = modelLabel !== undefined && lowerLabel.includes(p);
                if (inId || inLabel) {
                    matches.push({ group, prefixLen: p.length });
                }
            }
        }

        if (matches.length > 0) {
            matches.sort((a, b) => {
                if (b.prefixLen !== a.prefixLen) return b.prefixLen - a.prefixLen;
                return this.groups.indexOf(a.group) - this.groups.indexOf(b.group);
            });
            return matches[0].group;
        }

        return { id: 'other', label: 'Other', themeColor: '#888' };
    }

    getModelDisplayName(modelId, modelLabel) {
        const def = this.getModelDefinition(modelId, modelLabel);
        return def ? def.displayName : (modelLabel || modelId);
    }

    getModelDefinition(modelId, modelLabel) {
        // 1. Exact ID match
        for (const group of this.groups) {
            const model = group.models.find(m => m.id === modelId);
            if (model) return model;
        }

        // 2. modelName 精确匹配（处理服务端返回 Raw ID 的情况）
        for (const group of this.groups) {
            const model = group.models.find(m => m.modelName === modelId);
            if (model) return model;
        }

        // 3. Normalized ID match (MODEL_PLACEHOLDER_M47 -> placeholder-m47)
        const normalized = modelId.toLowerCase().replace(/^model_/, '').replace(/_/g, '-');
        for (const group of this.groups) {
            const model = group.models.find(m => m.id === normalized);
            if (model) return model;
        }

        // 4. Label 含 modelName 的模糊查找
        if (modelLabel) {
            for (const group of this.groups) {
                const model = group.models.find(m => modelLabel.includes(m.modelName));
                if (model) return model;
            }
        }

        return undefined;
    }
}

const testCases = [
    // 实际从日志中观察到的 placeholder Raw ID
    { id: 'MODEL_PLACEHOLDER_M47', label: 'Gemini 3 Flash' },
    { id: 'MODEL_PLACEHOLDER_M37', label: 'Gemini 3.1 Pro (High)' },
    { id: 'MODEL_PLACEHOLDER_M36', label: 'Gemini 3.1 Pro (Low)' },
    { id: 'MODEL_PLACEHOLDER_M35', label: 'Claude Sonnet 4.6 (Thinking)' },
    { id: 'MODEL_PLACEHOLDER_M26', label: 'Claude Opus 4.6 (Thinking)' },
    { id: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM', label: 'GPT-OSS 120B (Medium)' },
    // label-only Flash 匹配（placeholder ID 不含 gemini 关键字）
    { id: 'opaque-internal-id', label: 'Gemini 3 Flash' },
    // 前缀匹配兜底
    { id: 'gemini-extra-model', label: 'Some New Gemini' },
    { id: 'unknown-id', label: 'Custom Model' }
];

const manager = new MockStrategyManager();

console.log("Matching Analysis:");
console.log("".padEnd(60, '-'));
console.log(`${"Server ID".padEnd(25)} | ${"Display Name".padEnd(20)} | ${"Group"}`);
console.log("".padEnd(60, '-'));

testCases.forEach(tc => {
    const displayName = manager.getModelDisplayName(tc.id, tc.label);
    const group = manager.getGroupForModel(tc.id, tc.label);
    console.log(`${tc.id.padEnd(25)} | ${displayName.padEnd(20)} | ${group.label}`);
});
console.log("".padEnd(60, '-'));
