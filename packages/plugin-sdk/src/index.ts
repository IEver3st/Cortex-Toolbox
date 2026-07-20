import { z } from 'zod';
export const pluginPermissionSchema = z.enum([
  'workspace:read',
  'workspace:write',
  'archives:create',
  'external-tool:execute',
  'network:https',
]);
export const pluginManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9.-]+$/),
    name: z.string().min(1),
    version: z.string().min(1),
    apiVersion: z.literal(1),
    license: z.string().min(1),
    entry: z.string().min(1),
    permissions: z.array(pluginPermissionSchema),
    contributes: z
      .object({
        modelLoaders: z.array(z.string()).default([]),
        textureConverters: z.array(z.string()).default([]),
        metadataSchemas: z.array(z.string()).default([]),
        packageProfiles: z.array(z.string()).default([]),
        auditRules: z.array(z.string()).default([]),
        documentationExtractors: z.array(z.string()).default([]),
        exportTargets: z.array(z.string()).default([]),
      })
      .strict(),
  })
  .strict();
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export interface PermissionDecision {
  pluginId: string;
  granted: PluginPermission[];
  denied: PluginPermission[];
}

export class PluginPermissionRuntime {
  readonly #grants = new Map<string, Set<PluginPermission>>();
  review(
    manifest: PluginManifest,
    requested: PluginPermission[] = manifest.permissions,
  ): PermissionDecision {
    const granted = this.#grants.get(manifest.id) ?? new Set<PluginPermission>();
    return {
      pluginId: manifest.id,
      granted: requested.filter((permission) => granted.has(permission)),
      denied: requested.filter((permission) => !granted.has(permission)),
    };
  }
  grant(manifest: PluginManifest, permissions: PluginPermission[]): PermissionDecision {
    const declared = new Set(manifest.permissions);
    if (permissions.some((permission) => !declared.has(permission)))
      throw new Error('A plugin can only receive permissions declared in its manifest.');
    this.#grants.set(manifest.id, new Set(permissions));
    return this.review(manifest);
  }
  assert(pluginId: string, permission: PluginPermission): void {
    if (!this.#grants.get(pluginId)?.has(permission))
      throw new Error(`Plugin ${pluginId} does not have ${permission} permission.`);
  }
  revoke(pluginId: string): void {
    this.#grants.delete(pluginId);
  }
}
