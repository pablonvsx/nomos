// mobile-app/constants/app-version.ts
//
// The installed app version, shown as "v1.1.0". Single source of truth is the
// "version" in package.json: app.config.js reads it and expo-constants exposes
// it here at runtime. Do not repeat the version in the locale files.

import Constants from "expo-constants";
import { formatAppVersion } from "@/utils/app-version";

/** Raw installed version ("1.1.0"), for comparisons. Empty when unavailable. */
export const APP_VERSION = Constants.expoConfig?.version ?? "";

export const APP_VERSION_LABEL = formatAppVersion(Constants.expoConfig?.version);
