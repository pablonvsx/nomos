import React, { useState, useEffect } from "react";
import { View, StyleSheet, Image, ScrollView } from "react-native";
import { Text, Button, Card, IconButton, useTheme, ProgressBar } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import { BUTTON_RADIUS } from "@/constants/shape";

interface PhotoData {
  uri: string;
  timestamp: number;
}

interface Props {
  value?: any; // JSON string of PhotoData[] (or a raw array, for the custom-protocol module path)
  onChange: (value: string) => void;
  maxPhotos?: number;
}

// Drops entries with a non-string uri, e.g. leftover records corrupted by
// binding a raw array to the SQLite "photos" column before onChange was
// fixed to always serialize to JSON.
function sanitizePhotos(raw: any[]): PhotoData[] {
  return raw.filter(
    (p): p is PhotoData => typeof p?.uri === "string" && p.uri.length > 0,
  );
}

export default function PhotoInput({ value, onChange, maxPhotos = 10 }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { alert, confirm } = useAlertDialog();
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Load initial data
  useEffect(() => {
    // Handle if value is already an array (custom protocol modules keep it in memory)
    if (Array.isArray(value)) {
      setPhotos(sanitizePhotos(value));
      return;
    }

    // Legacy/corrupted values ("undefined", "null", "") are treated as no photos
    if (!value || value === "undefined" || value === "null") {
      setPhotos([]);
      return;
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        setPhotos(Array.isArray(parsed) ? sanitizePhotos(parsed) : []);
      } catch (e) {
        console.error("Error parsing photo data:", e);
        setPhotos([]);
      }
    } else {
      setPhotos([]);
    }
  }, [value]);

  // Sync to parent as a JSON string, matching the other list fields
  // (AudioNotesInput, NotesListInput) and the "photos" TEXT column contract.
  const updateParent = (newPhotos: PhotoData[]) => {
    setPhotos(newPhotos);
    onChange(JSON.stringify(newPhotos));
  };

  // Request permissions
  const requestPermissions = async (type: "camera" | "library") => {
    if (type === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        alert(
          t("survey.permissionDenied"),
          t("survey.cameraPermissionMsg"),
        );
        return false;
      }
    } else {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        alert(
          t("survey.permissionDenied"),
          t("survey.galleryPermissionMsg"),
        );
        return false;
      }
    }
    return true;
  };

  // Take photo with camera
  const takePhoto = async () => {
    const hasPermission = await requestPermissions("camera");
    if (!hasPermission) return;

    try {
      setIsProcessing(true);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const newPhoto: PhotoData = {
          uri: result.assets[0].uri,
          timestamp: Date.now(),
        };
        updateParent([...photos, newPhoto]);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      alert(t("common.error"), t("survey.cameraError"));
    } finally {
      setIsProcessing(false);
    }
  };

  // Pick photo(s) from gallery
  const pickPhoto = async () => {
    const hasPermission = await requestPermissions("library");
    if (!hasPermission) return;

    try {
      setIsProcessing(true);
      setProgress({ current: 0, total: 0 });
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // The native picker already returns all photos ready at once (it doesn't
        // expose per-photo progress during its internal compression), so we
        // attach them one by one with a small pause between each so the
        // progress bar is visible instead of jumping instantly.
        const total = result.assets.length;
        setProgress({ current: 0, total });
        const accumulated: PhotoData[] = [...photos];
        for (let i = 0; i < result.assets.length; i++) {
          accumulated.push({ uri: result.assets[i].uri, timestamp: Date.now() });
          setPhotos([...accumulated]);
          setProgress({ current: i + 1, total });
          if (i < result.assets.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
        }
        onChange(JSON.stringify(accumulated));
      }
    } catch (error) {
      console.error("Error picking photo:", error);
      alert(t("common.error"), t("survey.galleryError"));
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  // Remove photo
  const removePhoto = (index: number) => {
    confirm(
      t("survey.removePhoto"),
      t("survey.removePhotoConfirm"),
      () => {
        const newPhotos = photos.filter((_, i) => i !== index);
        updateParent(newPhotos);
      },
      undefined,
      t("common.remove"),
      t("common.cancel"),
      true,
    );
  };

  return (
    <View style={styles.container}>
      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <Button
          mode="contained-tonal"
          icon="camera"
          onPress={takePhoto}
          disabled={isProcessing}
          style={[styles.button, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("survey.takePhoto")}
        </Button>
        <Button
          mode="contained-tonal"
          icon="image"
          onPress={pickPhoto}
          disabled={isProcessing}
          style={[styles.button, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("survey.gallery")}
        </Button>
      </View>

      {/* Loading / progress indicator while attaching photo(s) */}
      {isProcessing ? (
        <View style={styles.progressContainer}>
          <ProgressBar
            indeterminate={progress.total === 0}
            progress={progress.total > 0 ? progress.current / progress.total : 0}
            color={theme.colors.primary}
            style={styles.progressBar}
          />
          <Text
            variant="bodySmall"
            style={[styles.counter, { color: theme.colors.onSurfaceVariant }]}
          >
            {progress.total > 0
              ? t("survey.attachingPhotos", { current: progress.current, total: progress.total })
              : t("survey.loadingPhotos")}
          </Text>
        </View>
      ) : (
        /* Photo Counter */
        <Text
          variant="bodySmall"
          style={[styles.counter, { color: theme.colors.onSurfaceVariant }]}
        >
          {photos.length}{" "}
          {photos.length === 1
            ? t("survey.photoAttached")
            : t("survey.photosAttached")}
        </Text>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.photoScroll}
        >
          {photos.map((photo, index) => (
            <Card
              key={`${photo.timestamp}-${index}`}
              style={[styles.photoCard, { borderColor: theme.colors.outlineVariant }]}
              mode="outlined"
            >
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <IconButton
                  icon="close-circle"
                  iconColor={theme.colors.error}
                  size={24}
                  onPress={() => removePhoto(index)}
                  style={styles.removeButton}
                />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      {photos.length === 0 && (
        <Card
          mode="outlined"
          style={[
            styles.emptyCard,
            {
              backgroundColor: theme.colors.surfaceVariant,
              borderColor: theme.colors.outline,
            },
          ]}
        >
          <Card.Content style={styles.emptyContent}>
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onSurfaceVariant,
                textAlign: "center",
              }}
            >
              {t("survey.noPhotos")}
            </Text>
            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.onSurfaceVariant,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {t("survey.useButtonsToAdd")}
            </Text>
          </Card.Content>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  button: {
    flex: 1,
  },
  counter: {
    textAlign: "center",
    marginBottom: 12,
    fontStyle: "italic",
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 6,
  },
  photoScroll: {
    marginTop: 8,
  },
  photoCard: {
    marginRight: 12,
    width: 150,
    height: 150,
  },
  photoContainer: {
    position: "relative",
    width: 150,
    height: 150,
  },
  photo: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  removeButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "white",
    borderRadius: 12,
  },
  emptyCard: {
    marginTop: 8,
  },
  emptyContent: {
    paddingVertical: 24,
    alignItems: "center",
  },
});
