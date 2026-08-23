import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useTheme } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";

interface ThemeColors {
  background: string;
  surface: string;
  onSurface: string;
  onSurfaceVariant: string;
  surfaceVariant: string;
  primary: string;
  onPrimary: string;
}

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  tryAgainLabel?: string;
  goBackLabel?: string;
  errorDetailsLabel?: string;
  showDetails?: boolean;
  themeColors?: ThemeColors;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoBack = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  render() {
    if (this.state.hasError) {
      const {
        fallbackTitle,
        fallbackMessage,
        showDetails = false,
      } = this.props;
      const { error, errorInfo } = this.state;

      const c = this.props.themeColors;
      return (
        <View style={[styles.container, c && { backgroundColor: c.background }]}>
          <View style={styles.content}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={[styles.title, c && { color: c.onSurface }]}>
              {fallbackTitle}
            </Text>
            <Text style={[styles.message, c && { color: c.onSurfaceVariant }]}>
              {fallbackMessage}
            </Text>

            {showDetails && error && (
              <ScrollView style={[styles.detailsContainer, c && { backgroundColor: c.surfaceVariant }]}>
                <Text style={[styles.detailsTitle, c && { color: c.onSurface }]}>{this.props.errorDetailsLabel}</Text>
                <Text style={[styles.detailsText, c && { color: c.onSurfaceVariant }]}>{error.toString()}</Text>
                {errorInfo && (
                  <Text style={[styles.detailsText, c && { color: c.onSurfaceVariant }]}>
                    {errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, c && { backgroundColor: c.primary }]}
                onPress={this.handleReset}
              >
                <Text style={[styles.buttonText, c && { color: c.onPrimary }]}>{this.props.tryAgainLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, c && { backgroundColor: c.surface, borderColor: c.primary }]}
                onPress={this.handleGoBack}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText, c && { color: c.primary }]}>
                  {this.props.goBackLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundaryThemed(props: Omit<Props, "themeColors" | "tryAgainLabel" | "goBackLabel" | "errorDetailsLabel">) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <ErrorBoundary
      {...props}
      themeColors={theme.colors}
      fallbackTitle={props.fallbackTitle ?? t("common.somethingWentWrong")}
      fallbackMessage={props.fallbackMessage ?? t("common.unexpectedError")}
      tryAgainLabel={t("common.tryAgain")}
      goBackLabel={t("common.back")}
      errorDetailsLabel={t("common.errorDetails")}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    maxWidth: 400,
    alignItems: "center",
  },
  icon: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  detailsContainer: {
    maxHeight: 200,
    width: "100%",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 12,
    color: "#666",
    fontFamily: "monospace",
  },
  buttonContainer: {
    width: "100%",
    gap: 12,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  secondaryButtonText: {
    color: "#007AFF",
  },
});
