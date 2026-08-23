export interface ImpactItem {
  type: string;
  magnitude: string;
  details: string;
}

export interface ImpactsModuleData {
  impacts: ImpactItem[];
}

export function serializeImpacts(data: unknown): string {
  return JSON.stringify(data);
}

export function deserializeImpacts(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);

  // Novo formato: { impacts: ImpactItem[] }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).impacts)
  ) {
    return parsed;
  }

  // Formato legado: Record<string, {magnitude?, details?, observations?}>
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, { magnitude?: string; details?: string; observations?: string }>;
    const impacts: ImpactItem[] = Object.entries(record).map(([type, v]) => ({
      type,
      magnitude: v.magnitude ?? "",
      details: v.details ?? v.observations ?? "",
    }));
    return { impacts };
  }

  return { impacts: [] };
}

// Converts the module's array shape into the flat Record<type, {magnitude, details}>
// shape the ImpactList widget hydrates its checkbox state from.
export function toRecordJson(data: ImpactsModuleData): string {
  const record: Record<string, { magnitude: string; details: string }> = {};
  for (const item of data.impacts) {
    record[item.type] = { magnitude: item.magnitude, details: item.details };
  }
  return JSON.stringify(record);
}

export function fromRecordJson(recordStr: string): ImpactsModuleData {
  try {
    const record = JSON.parse(recordStr) as Record<string, { magnitude?: string; details?: string }>;
    const impacts: ImpactItem[] = Object.entries(record).map(([type, v]) => ({
      type,
      magnitude: v.magnitude ?? "",
      details: v.details ?? "",
    }));
    return { impacts };
  } catch {
    return { impacts: [] };
  }
}
