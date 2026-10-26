import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import {
  ACTIVITY_VISIBLE_LINES,
  describeActivity,
  visibleActivity,
  type ActivityEvent,
} from "@/core/ui/activity-log";

// Small type, one line per event. The height is FIXED for the full number of
// lines, so the dialog never grows or shrinks while the log fills.
const LINE_HEIGHT = 16;

/**
 * The last few events of a backup, oldest at the top and the newest at the
 * bottom, so the eye stays where the new line appears. A polite live region:
 * a screen reader announces new lines without interrupting what it is saying.
 */
export function BackupActivityLog({ log }: { log: readonly ActivityEvent[] }) {
  const theme = useTheme();
  const { t } = useI18n();
  const lines = visibleActivity(log, ACTIVITY_VISIBLE_LINES);

  return (
    <View style={styles.box} accessibilityLiveRegion="polite" accessible>
      {lines.map((event, index) => {
        const isNewest = index === lines.length - 1;
        return (
          <Text
            key={`${log.length - lines.length + index}`}
            variant="bodySmall"
            numberOfLines={1}
            style={[
              styles.line,
              {
                color: event.type === "item-failed" ? theme.colors.error : theme.colors.onSurfaceVariant,
                opacity: isNewest ? 1 : 0.75,
              },
            ]}
          >
            {describeActivity(event, t)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Lines stack from the bottom; anything above the box is clipped.
  box: { height: LINE_HEIGHT * ACTIVITY_VISIBLE_LINES, justifyContent: "flex-end", overflow: "hidden", marginTop: 4 },
  line: { height: LINE_HEIGHT, lineHeight: LINE_HEIGHT, fontSize: 12 },
});
