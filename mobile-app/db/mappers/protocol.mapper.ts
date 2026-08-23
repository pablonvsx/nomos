import { Protocol } from "@/types/database";
import { isStringArray, parseJsonText } from "./json-utils";

export interface ProtocolDbRow extends Omit<Protocol, "authors"> {
  authors?: string | null;
  is_active?: number;
}

export function mapProtocolFromDb(row: ProtocolDbRow): Protocol {
  return {
    id: row.id,
    title: row.title,
    authors: parseJsonText<string[]>(row.authors, [], isStringArray),
    description: row.description,
    year: row.year,
    version: row.version,
    json_rules_path: row.json_rules_path,
  };
}
