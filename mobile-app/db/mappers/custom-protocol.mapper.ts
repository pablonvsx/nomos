import { CustomProtocol, CustomProtocolSchema } from "@/types/database";
import { ensureJsonText, parseJsonText } from "./json-utils";

interface CustomProtocolDbBase {
  id: number;
  name: string;
  theme: string;
  description?: string | null;
  collection_instructions?: string | null;
  schema?: string | null;
  created_at: string;
  updated_at: string;
  uuid?: string | null;
}

export type CustomProtocolDbRow = CustomProtocolDbBase;

const EMPTY_SCHEMA: CustomProtocolSchema = {
  sections: [],
};

function isCustomProtocolSchema(value: unknown): value is CustomProtocolSchema {
  if (!value || typeof value !== "object") return false;
  const maybeSchema = value as { sections?: unknown };
  return Array.isArray(maybeSchema.sections);
}

export function mapCustomProtocolFromDb(row: CustomProtocolDbRow): CustomProtocol {
  return {
    id: row.id,
    name: row.name,
    theme: row.theme ?? "",
    description: row.description ?? undefined,
    collection_instructions: row.collection_instructions ?? undefined,
    schema: parseJsonText<CustomProtocolSchema>(
      row.schema,
      EMPTY_SCHEMA,
      isCustomProtocolSchema,
    ),
    created_at: row.created_at,
    updated_at: row.updated_at,
    uuid: row.uuid ?? null,
  };
}

export function toDbProtocolSchema(schema: CustomProtocolSchema): string {
  return ensureJsonText(JSON.stringify(schema), JSON.stringify(EMPTY_SCHEMA));
}
