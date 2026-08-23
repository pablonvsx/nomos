import React, { useCallback } from "react";
import { Card, useTheme } from "react-native-paper";
import ImpactList from "@/modules/paisageo/components/ImpactList";
import type { ModuleRendererProps, LocalizedString } from "@/protocol-kernel/types";
import type { ImpactsModuleData } from "./serde";
import { toRecordJson, fromRecordJson } from "./serde";
import { IMPACTS_FIELD_CONFIG } from "./impact-types-config";

// Ported from the legacy paisageo_protocol.json section title (Fase 2 of the
// plugin-architecture migration).
const SECTION_TITLE: LocalizedString = {
  pt: "Impactos Ambientais",
  en: "Environmental Impacts",
  es: "Impactos Ambientales",
  fr: "Impacts Environnementaux",
};

// ImpactList shows its help text inline (per impact type and per magnitude,
// depending on which type is selected), not via an info-bubble tap - so
// onInfoPress isn't threaded here, unlike the other PAISAGEO renderers.
// Memoized: see the same note in GeoecologicalConstraintsModuleRenderer.tsx.
export const ImpactsModuleRenderer = React.memo(function ImpactsModuleRenderer({ value, onChange, language }: ModuleRendererProps) {
  const theme = useTheme();
  // Guard on `impacts` actually being an array, not just "value is some
  // object" - a brand new point starts with value === {} (no `impacts` key
  // at all yet), which would otherwise slip through as ImpactsModuleData and
  // crash toRecordJson() below on `data.impacts` being undefined.
  const data: ImpactsModuleData =
    value != null &&
    typeof value === "object" &&
    Array.isArray((value as ImpactsModuleData).impacts)
      ? (value as ImpactsModuleData)
      : { impacts: [] };

  const recordStr = toRecordJson(data);

  const handleChange = useCallback(
    (val: string) => {
      onChange(fromRecordJson(val));
    },
    [onChange],
  );

  return (
    <Card mode="elevated" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Card.Title
        title={SECTION_TITLE[language] ?? SECTION_TITLE["pt"]}
        titleVariant="titleMedium"
        style={{ backgroundColor: theme.colors.surfaceVariant, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
      />
      <Card.Content style={{ paddingTop: 16 }}>
        <ImpactList
          field={IMPACTS_FIELD_CONFIG}
          value={recordStr}
          onChange={handleChange}
        />
      </Card.Content>
    </Card>
  );
});
