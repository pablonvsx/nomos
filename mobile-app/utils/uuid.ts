import * as Crypto from "expo-crypto";

// Client-side id for a new point (points.id is a TEXT PK, generated before insert).
export function generatePointId(): string {
  return Crypto.randomUUID();
}
