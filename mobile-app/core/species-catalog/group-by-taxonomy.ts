/**
 * Generic family -> genus -> item grouping, shared by the species search results
 * (grouped by taxonomy, ordered by occurrence count) and the "My Catalog" tree
 * (grouped by taxonomy, ordered alphabetically).
 */

export interface TaxonomyGroupable {
  family?: string;
  genus?: string;
}

export interface TaxonomyGenusGroup<T> {
  genus: string;
  items: T[];
  weight: number;
}

export interface TaxonomyFamilyGroup<T> {
  family: string;
  genera: TaxonomyGenusGroup<T>[];
  weight: number;
}

export function familyGenusKey(family: string, genus: string): string {
  return `${family}|${genus}`;
}

export function groupByFamilyAndGenus<T extends TaxonomyGroupable>(
  items: T[],
  options: {
    noFamilyLabel: string;
    noGenusLabel: string;
    // When provided, families/genera/items are sorted descending by summed weight
    // (e.g. occurrence count). When omitted, everything is sorted alphabetically.
    weightOf?: (item: T) => number;
    labelOf?: (item: T) => string;
  },
): TaxonomyFamilyGroup<T>[] {
  const { noFamilyLabel, noGenusLabel, weightOf, labelOf } = options;
  const familyMap = new Map<string, Map<string, T[]>>();

  for (const item of items) {
    const family = item.family || noFamilyLabel;
    const genus = item.genus || noGenusLabel;

    if (!familyMap.has(family)) familyMap.set(family, new Map());
    const genusMap = familyMap.get(family)!;

    if (!genusMap.has(genus)) genusMap.set(genus, []);
    genusMap.get(genus)!.push(item);
  }

  const sortItems = (a: T, b: T): number => {
    if (weightOf) return weightOf(b) - weightOf(a);
    return (labelOf?.(a) ?? "").localeCompare(labelOf?.(b) ?? "");
  };

  const familyGroups: TaxonomyFamilyGroup<T>[] = Array.from(familyMap.entries()).map(
    ([family, genusMap]) => {
      const genera: TaxonomyGenusGroup<T>[] = Array.from(genusMap.entries()).map(
        ([genus, genusItems]) => {
          const sortedItems = [...genusItems].sort(sortItems);
          return {
            genus,
            items: sortedItems,
            weight: sortedItems.reduce((sum, item) => sum + (weightOf?.(item) ?? 0), 0),
          };
        },
      );

      genera.sort((a, b) => (weightOf ? b.weight - a.weight : a.genus.localeCompare(b.genus)));

      return {
        family,
        genera,
        weight: genera.reduce((sum, g) => sum + g.weight, 0),
      };
    },
  );

  familyGroups.sort((a, b) => (weightOf ? b.weight - a.weight : a.family.localeCompare(b.family)));

  return familyGroups;
}
