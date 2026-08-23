// src/components/survey/AudioNotesInput.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import {
  Text,
  Button,
  Card,
  IconButton,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import {
  useAudioRecorder,
  useAudioRecorderState,
  createAudioPlayer,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import { BUTTON_RADIUS } from "@/constants/shape";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioNoteData {
  uri: string;
  duration: number; // seconds (float)
  timestamp: number; // ms since epoch
}

interface AudioNotesInputProps {
  value: string; // JSON string of AudioNoteData[]
  onChange: (value: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAudioNotes(raw: string): AudioNoteData[] {
  if (!raw || raw === "" || raw === "null" || raw === "[]") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((n) => n?.uri);
  } catch {
    /* ignore */
  }
  return [];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AudioNotesInput({ value, onChange }: AudioNotesInputProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();

  // Parsed note list
  const notes = parseAudioNotes(value);

  // ── Recorder (hook-managed lifecycle) ──
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 500);

  // ── Playback state ──
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [isLoadingSound, setIsLoadingSound] = useState(false);
  const playerRef = useRef<AudioPlayer | null>(null);

  // ── Cleanup player on unmount ──
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  const releasePlayer = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.remove();
      playerRef.current = null;
    }
    setPlayingIndex(null);
  }, []);

  // ── Request microphone permission ──
  const requestMicPermission = async (): Promise<boolean> => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      alert(
        t("survey.permissionDenied"),
        t("audio.microphonePermissionMsg") || "Microphone access is required.",
      );
      return false;
    }
    return true;
  };

  // ── Start recording ──
  const handleStartRecording = async () => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    try {
      releasePlayer();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error("Error starting recording:", err);
      alert(t("common.error"), t("audio.recordError") || "Error starting recording.");
    }
  };

  // ── Stop recording ──
  const handleStopRecording = async () => {
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      const uri = recorder.uri;
      if (!uri) throw new Error("No URI returned from recording");

      const duration = recorder.currentTime; // seconds

      const newNote: AudioNoteData = {
        uri,
        duration,
        timestamp: Date.now(),
      };
      onChange(JSON.stringify([...notes, newNote]));
    } catch (err) {
      console.error("Error stopping recording:", err);
      alert(t("common.error"), t("audio.recordError") || "Error saving recording.");
    }
  };

  // ── Play / Pause ──
  const handlePlayNote = useCallback(
    async (index: number) => {
      if (playingIndex === index) {
        releasePlayer();
        return;
      }

      releasePlayer();

      const note = notes[index];
      if (!note?.uri) return;

      setIsLoadingSound(true);
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

        const player = createAudioPlayer({ uri: note.uri });
        player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish) {
            player.remove();
            if (playerRef.current === player) playerRef.current = null;
            setPlayingIndex(null);
          }
        });
        playerRef.current = player;
        player.play();
        setPlayingIndex(index);
      } catch (err) {
        console.error("Error playing sound:", err);
        alert(t("common.error"), t("audio.playError") || "Error playing audio.");
        releasePlayer();
      } finally {
        setIsLoadingSound(false);
      }
    },
    [playingIndex, notes, t, releasePlayer],
  );

  // ── Delete note ──
  const handleDeleteNote = (index: number) => {
    if (playingIndex === index) releasePlayer();
    onChange(JSON.stringify(notes.filter((_, i) => i !== index)));
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const isRecording = recorderState.isRecording;
  const recordingSeconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  return (
    <View>
      {/* Empty state */}
      {notes.length === 0 && !isRecording && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, fontStyle: "italic" }}
        >
          {t("audio.noAudioNotes") || "No audio notes recorded"}
        </Text>
      )}

      {/* Audio note cards */}
      {notes.map((note, index) => {
        const isPlaying = playingIndex === index;
        return (
          <Card
            key={`${note.timestamp}-${index}`}
            mode="outlined"
            style={[styles.noteCard, { borderColor: theme.colors.outlineVariant }]}
          >
            <View style={styles.noteRow}>
              {/* Title + meta */}
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
                  {`audio_note_${index + 1}`}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontVariant: ["tabular-nums"] }}>
                  {formatDuration(note.duration)}{" · "}
                  {new Date(note.timestamp).toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  {" "}
                  {new Date(note.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>

              {/* Play / Pause button */}
              {isLoadingSound && playingIndex === null ? (
                <ActivityIndicator size={20} style={{ marginRight: 4 }} />
              ) : (
                <IconButton
                  icon={isPlaying ? "pause-circle" : "play-circle"}
                  size={28}
                  iconColor={isPlaying ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  onPress={() => handlePlayNote(index)}
                  style={{ margin: 0 }}
                />
              )}

              {/* Delete button */}
              <IconButton
                icon="delete-outline"
                size={20}
                iconColor={theme.colors.error}
                onPress={() => handleDeleteNote(index)}
                style={{ margin: 0, marginLeft: -4 }}
              />
            </View>
          </Card>
        );
      })}

      {/* Recording in progress */}
      {isRecording ? (
        <View style={[styles.recordingBar, { backgroundColor: theme.colors.errorContainer, borderColor: theme.colors.error }]}>
          <View style={styles.recordingLeft}>
            <View style={[styles.recordingDot, { backgroundColor: theme.colors.error }]} />
            <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, fontVariant: ["tabular-nums"] }}>
              {formatDuration(recordingSeconds)}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer, marginLeft: 8 }}>
              {t("audio.recording") || "Recording..."}
            </Text>
          </View>
          <Button
            mode="contained"
            buttonColor={theme.colors.error}
            textColor={theme.colors.onError}
            icon="stop"
            onPress={handleStopRecording}
            compact
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("audio.stopRecording") || "Stop"}
          </Button>
        </View>
      ) : (
        <Button
          mode="outlined"
          icon="microphone"
          onPress={handleStartRecording}
          style={styles.recordButton}
          textColor={theme.colors.primary}
        >
          {t("audio.recordNew") || "Record audio note"}
        </Button>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  noteCard: {
    marginBottom: 8,
    borderRadius: 8,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  badge: {
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  recordingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordButton: {
    marginTop: 4,
    borderStyle: "dashed",
    borderRadius: BUTTON_RADIUS,
  },
});
