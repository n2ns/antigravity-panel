/**
 * Quota Strategy Manager
 *
 * Logic for grouping models and determining display properties based on configuration.
 */

import strategyData from '../shared/config/quota_strategy.json';

/**
 * True when `needle` occurs in `haystack` with no alphanumeric character on
 * either side. Prevents numeric-suffixed IDs from matching their prefixes
 * (e.g. "…_m26" inside "…_m264").
 */
function containsToken(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at > 0 ? haystack[at - 1] : '';
    const after = at + needle.length < haystack.length ? haystack[at + needle.length] : '';
    if (!/[a-z0-9]/i.test(before || ' ') && !/[a-z0-9]/i.test(after || ' ')) return true;
    from = at + 1;
  }
}

export interface ModelDefinition {
  id: string;
  modelName: string;
  displayName: string;
}

export interface GroupDefinition {
  id: string;
  quotaPoolId: string;
  label: string;
  themeColor: string;
  prefixes?: string[]; // Configured prefixes for fuzzy matching
  shortLabel: string;
  models: ModelDefinition[];
}

export interface QuotaPoolDefinition {
  id: string;
  label: string;
  shortLabel: string;
  themeColor: string;
}

export interface QuotaStrategyDefinition {
  quotaPools: QuotaPoolDefinition[];
  groups: GroupDefinition[];
}

export class QuotaStrategyManager {
  private groups: GroupDefinition[];
  private quotaPools: QuotaPoolDefinition[];

  constructor(strategy: QuotaStrategyDefinition = strategyData) {
    this.groups = strategy.groups;
    this.quotaPools = strategy.quotaPools;
  }

  getGroups(): GroupDefinition[] {
    return this.groups;
  }

  getQuotaPools(): QuotaPoolDefinition[] {
    return this.quotaPools;
  }

  getPoolIdForHistoryKey(key: string): string {
    if (this.quotaPools.some(pool => pool.id === key)) return key;
    return this.groups.find(group => group.id === key)?.quotaPoolId ?? key;
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
        // Check 1: Label contains config name as a whole token
        if (mName === lowerLabel || containsToken(lowerLabel, mName)) return true;
        // Check 2: Config name is the server ID (User config Tolerance).
        // Must be exact: server IDs share numeric prefixes, so substring
        // matching routes MODEL_PLACEHOLDER_M264 (Gemini 3.6 Flash) to
        // MODEL_PLACEHOLDER_M26 (Claude Opus).
        if (lowerId && lowerId === mName) return true;
        return false;
      });
      if (model) return model;
    }
    return undefined;
  }
}
