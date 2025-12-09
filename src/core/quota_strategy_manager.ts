import strategyData from '../config/quota_strategy.json';

export interface ModelDefinition {
  id: string;
  modelName: string;
  displayName: string;
}

export interface GroupDefinition {
  id: string;
  label: string;
  themeColor: string;
  prefixes?: string[]; // Configured prefixes for fuzzy matching
  models: ModelDefinition[];
}

export class QuotaStrategyManager {
  private groups: GroupDefinition[];

  constructor() {
    this.groups = strategyData.groups;
  }

  getGroups(): GroupDefinition[] {
    return this.groups;
  }

  /**
   * Find the group that a model belongs to based on model ID
   */
  getGroupForModel(modelId: string, modelLabel?: string): GroupDefinition {
    // 0. Strong Match via Model Definition
    const def = this.getModelDefinition(modelId, modelLabel);
    if (def) {
      const group = this.groups.find(g => g.models.includes(def));
      if (group) return group;
    }

    // 1. Exact match in configured models list (Backup)
    for (const group of this.groups) {
      if (group.models.some(m => m.id === modelId)) {
        return group;
      }
    }
    
    // 2. Configuration Driven Prefix/Keyword Matching
    const lowerId = modelId.toLowerCase();
    const lowerLabel = modelLabel?.toLowerCase() || '';

    for (const group of this.groups) {
      if (group.prefixes) {
        for (const prefix of group.prefixes) {
          const p = prefix.toLowerCase();
          // Priority 1: ID contains prefix
          if (lowerId.includes(p)) return group;
          // Priority 2: Label contains prefix (Fallback)
          if (modelLabel && lowerLabel.includes(p)) return group;
        }
      }
    }

    // 3. Classify as "Other"
    const otherGroup = this.groups.find(g => g.id === 'other');
    return otherGroup || this.groups[0];
  }

  /**
   * Get model display name
   */
  getModelDisplayName(modelId: string, modelLabel?: string): string | undefined {
    const def = this.getModelDefinition(modelId, modelLabel);
    return def?.displayName;
  }

  /**
   * Get the full model definition config
   */
  getModelDefinition(modelId: string, modelLabel?: string): ModelDefinition | undefined {
    // 1. Exact Match
    for (const group of this.groups) {
      const model = group.models.find(m => m.id === modelId);
      if (model) return model;
    }

    // 2. Normalized Match
    const normalized = modelId.toLowerCase().replace(/^model_/, '').replace(/_/g, '-');
    for (const group of this.groups) {
        const model = group.models.find(m => m.id === normalized);
        if (model) return model;
    }

    // 3. Label Match (Fallback)
    if (modelLabel) {
        // Pass modelId as well to allow loose matching if user put ID in modelName
        const model = this.findModelByLabel(modelLabel, modelId);
        if (model) return model;
    }

    return undefined;
  }

  /**
   * Enhanced find model that matches logic used in getModelDisplayName
   */
  private findModelByLabel(label: string, modelId?: string): ModelDefinition | undefined {
      const lowerLabel = label.toLowerCase();
      const lowerId = modelId?.toLowerCase() || '';

      for (const group of this.groups) {
          const model = group.models.find(m => {
              const mName = m.modelName.toLowerCase();
              // Check 1: Label contains config name
              if (mName === lowerLabel || lowerLabel.includes(mName)) return true;
              // Check 2: Config name looks like the ID (User config Tolerance)
              if (modelId && (lowerId === mName || lowerId.includes(mName))) return true;
              return false;
          });
          if (model) return model;
      }
      return undefined;
  }
}
