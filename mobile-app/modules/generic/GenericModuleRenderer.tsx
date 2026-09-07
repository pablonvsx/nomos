import React, { useRef } from "react";
import { Card } from "react-native-paper";
import type { ModuleDescriptor, LanguageCode } from "@/protocol-kernel/types";
import { GenericFieldRow } from "./GenericFieldRow";
import { RepeatableGroupField } from "./RepeatableGroupField";

interface Props {
  module: ModuleDescriptor;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  language: LanguageCode;
  projectId?: number;
  surveyPointId?: string;
}

// Memoized: the survey form keeps every module's data in one shared state
// object, so any field change re-renders the whole form - without this,
// every custom-protocol module card would re-render on every keystroke/tap
// anywhere in the form, not just its own.
export const GenericModuleRenderer = React.memo(function GenericModuleRenderer({
  module,
  value,
  onChange,
  language,
  projectId,
  surveyPointId,
}: Props) {
  // Stable per-key onChange (always reads the latest `value`/`onChange` via
  // refs) - a fresh inline arrow per field/group on every render would
  // defeat GenericFieldRow's/SurveySelect's React.memo.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fieldOnChangeCache = useRef<Record<string, (val: unknown) => void>>({});
  const getFieldOnChange = (fieldId: string) => {
    if (!fieldOnChangeCache.current[fieldId]) {
      fieldOnChangeCache.current[fieldId] = (val: unknown) =>
        onChangeRef.current({ ...valueRef.current, [fieldId]: val });
    }
    return fieldOnChangeCache.current[fieldId];
  };

  const groupOnChangeCache = useRef<Record<string, (items: Record<string, unknown>[]) => void>>({});
  const getGroupOnChange = (groupId: string) => {
    if (!groupOnChangeCache.current[groupId]) {
      groupOnChangeCache.current[groupId] = (nextItems: Record<string, unknown>[]) =>
        onChangeRef.current({ ...valueRef.current, [groupId]: nextItems });
    }
    return groupOnChangeCache.current[groupId];
  };

  return (
    <Card style={{ marginBottom: 24, borderRadius: 12 }} mode="elevated">
      <Card.Title
        title={module.title[language] ?? module.title["pt"] ?? module.id}
        titleVariant="titleMedium"
        titleStyle={{ fontWeight: "bold" }}
      />
      <Card.Content style={{ paddingTop: 16 }}>
        {module.schema.fields.map((field) => (
          <GenericFieldRow
            key={field.id}
            field={field}
            value={value[field.id]}
            onChange={getFieldOnChange(field.id)}
            language={language}
            projectId={projectId}
            surveyPointId={surveyPointId}
          />
        ))}
        {(module.schema.dynamic ?? []).map((group) => (
          <RepeatableGroupField
            key={group.groupId}
            group={group}
            label={group.label?.[language] ?? group.label?.["pt"] ?? group.groupId}
            items={(value[group.groupId] as Record<string, unknown>[]) ?? []}
            onChange={getGroupOnChange(group.groupId)}
            language={language}
            projectId={projectId}
            surveyPointId={surveyPointId}
          />
        ))}
      </Card.Content>
    </Card>
  );
});
