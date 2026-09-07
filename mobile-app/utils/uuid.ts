import * as Crypto from "expo-crypto";

export function generateUuid(): string {
  return Crypto.randomUUID();
}

// Client-side id for a new point (points.id is a TEXT PK, generated before insert).
export function generatePointId(): string {
  return generateUuid();
}
