// The composition root for providers: the only Shared module allowed to import from
// src/Providers/ (ADR 0008). Adding a provider means adding one entry here.

import { ClaudeCodeProviderAdapter } from "@/Providers/ClaudeCode/Adapters/ClaudeCodeProviderAdapter.js";
import type { BaseProviderAdapter } from "@/Shared/Adapters/BaseProviderAdapter.js";
import type { ProviderType } from "@/Shared/Protocols/ProviderProtocol.js";

type ProviderFactory = () => BaseProviderAdapter;

export class ProviderModule {
  static readonly DEFAULT_PROVIDER: ProviderType = "claude-code";

  private static readonly TYPE_TO_FACTORY: Record<ProviderType, ProviderFactory> = {
    "claude-code": () => new ClaudeCodeProviderAdapter(),
  };

  static create(type: ProviderType = ProviderModule.DEFAULT_PROVIDER): BaseProviderAdapter {
    return ProviderModule.TYPE_TO_FACTORY[type]();
  }

  static isProviderType(value: string): value is ProviderType {
    return Object.hasOwn(ProviderModule.TYPE_TO_FACTORY, value);
  }

  static types(): ProviderType[] {
    return Object.keys(ProviderModule.TYPE_TO_FACTORY) as ProviderType[];
  }
}
