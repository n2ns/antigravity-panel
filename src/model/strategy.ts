/**
 * Quota Strategy Manager
 *
 * Logic for grouping models and determining display properties based on configuration.
 */

import strategyData from '../shared/config/quota_strategy.json';

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
  shortLabel: string;
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

    // 2. Configuration Driven Prefix/Keyword Matching (longest prefix wins)
    const lowerId = modelId.toLowerCase();
    const lowerLabel = modelLabel?.toLowerCase() || '';

    type PrefixMatch = { group: GroupDefinition; prefixLen: number };
    const matches: PrefixMatch[] = [];

    for (const group of this.groups) {
      if (!group.prefixes) continue;
      for (const prefix of group.prefixes) {
        const p = prefix.toLowerCase();
        // The broad "gemini" prefix must not classify Gemini Flash (IDs and labels like "Gemini 3 Flash").
        if (group.id === 'gemini-pro' && p === 'gemini') {
          if (lowerId.includes('flash') || lowerLabel.includes('flash')) {
            continue;
          }
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
