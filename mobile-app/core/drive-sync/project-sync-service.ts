import type { ProtocolRegistry } from '@/protocol-kernel/types';

// syncProjectFromDrive (the old pull-based multi-device sync, plus its
// reference-data - species/vegetation-class - push/pull) was removed here:
// COLLAB_MODEL_V2_REFERENCE.md section 8 explicitly retires that pull logic
// in favor of the explicit, one-directional "Fazer backup" action
// (core/drive-sync/backup-service.ts), and restoring a project onto a new
// device is now core/drive-sync/project-drive-service.ts's
// restoreOwnProjectFromDrive, which downloads every approved point directly
// instead of reusing this file's create/update branches. serializeModules
// stays here since core/project-sharing/import-points.ts,
// resolve-duplicates.ts and project-drive-service.ts all still depend on it.
export function serializeModules(
  modules: Record<string, unknown>,
  protocolId: string,
  registry: ProtocolRegistry,
): Record<string, string> {
  const manifest = registry.getProtocol(protocolId);
  const data: Record<string, string> = {};
  for (const [moduleId, value] of Object.entries(modules)) {
    const descriptor = manifest?.modules.find((m) => m.id === moduleId);
    data[moduleId] = descriptor ? descriptor.serialize(value) : JSON.stringify(value);
  }
  return data;
}
