export const CARDINAL_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type CardinalPoint = (typeof CARDINAL_POINTS)[number];

/** Converts an angle in degrees (0-360) to the nearest cardinal point (8 points). */
export function degreesToCardinal(degrees: number): CardinalPoint {
  const index = Math.round(degrees / 45) % 8;
  return CARDINAL_POINTS[index];
}

/** Converts a cardinal point (8 points) to its standard degree (multiples of 45°). */
export function cardinalToDegrees(cardinal: CardinalPoint): number {
  return CARDINAL_POINTS.indexOf(cardinal) * 45;
}

/** Formata um valor de azimute mostrando grau, nome por extenso e sigla do ponto cardeal (ex.: "180° - Sul (S)"). */
export function formatAzimuthDisplay(degrees: number, t: (key: string) => string): string {
  const cardinal = degreesToCardinal(degrees);
  return `${degrees}° - ${t(`survey.azimuthCardinalPoints.${cardinal}`)} (${cardinal})`;
}
