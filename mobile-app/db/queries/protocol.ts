// src/db/queries/protocols.ts
import { db } from "../initialize";
import { Protocol } from "@/types/database";
import { mapProtocolFromDb, ProtocolDbRow } from "../mappers/protocol.mapper";

/**
 * Fetches all active protocols to populate the selection list
 */
export async function getActiveProtocols(): Promise<Protocol[]> {
  try {
    const query =
      "SELECT * FROM protocols WHERE is_active = 1 ORDER BY title ASC";
    const results = await db.getAllAsync<ProtocolDbRow>(query);
    return results.map(mapProtocolFromDb);
  } catch (error) {
    console.error("Error fetching protocols:", error);
    return [];
  }
}

/**
 * Fetches a specific protocol by ID
 */
export async function getProtocolById(
  protocolId: string,
): Promise<Protocol | null> {
  try {
    const query = "SELECT * FROM protocols WHERE id = ? LIMIT 1";
    const result = await db.getFirstAsync<ProtocolDbRow>(query, [protocolId]);
    return result ? mapProtocolFromDb(result) : null;
  } catch (error) {
    console.error("Error fetching protocol:", error);
    return null;
  }
}
