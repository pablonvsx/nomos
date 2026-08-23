# 03. Tech stack

Real dependencies extracted from `mobile-app/package.json`. Exact versions per the file (`package.json` is at app version `1.0.0`).

## Framework and core

| Package | Version |
|---|---|
| `expo` | ~54.0.36 |
| `react` | 19.1.0 |
| `react-dom` | 19.1.0 |
| `react-native` | 0.81.5 |
| `react-native-web` | ~0.21.0 |
| `typescript` (dev) | ~5.9.2 |

## Routing and navigation

| Package | Version | Use |
|---|---|---|
| `expo-router` | ~6.0.24 | File-based routing (`app/`) |
| `@react-navigation/native` | ^7.1.8 | Expo Router's foundation |
| `@react-navigation/bottom-tabs` | ^7.4.0 | Tab navigation (`app/(tabs)/`) |
| `@react-navigation/elements` | ^2.6.3 | Navigation elements |
| `react-native-screens` | ~4.16.0 | Native screen optimization |
| `react-native-safe-area-context` | ~5.6.0 | Safe areas (notch, etc.) |
| `react-native-gesture-handler` | ~2.28.0 | Gestures |

## UI

| Package | Version | Use |
|---|---|---|
| `react-native-paper` | ^5.14.5 | Material Design 3 (foundation of the whole UI) |
| `@expo/vector-icons` | ^15.0.3 | Icons |
| `react-native-reanimated` | ~4.1.1 | Animations |
| `react-native-worklets` | 0.5.1 | Native worklet support (reanimated) |
| `react-native-view-shot` | ^4.0.3 | Screen capture (used in the export flow) |
| `@react-native-community/slider` | 5.0.1 | Native slider (`percentage`/`azimuth` fields, `modules/generic/FieldRenderer.tsx`) |
| `expo-clipboard` | ~8.0.8 | Copy-to-clipboard (`app/(projects)/protocol/native-catalog.tsx`) |

## Database

| Package | Version | Use |
|---|---|---|
| `expo-sqlite` | ~16.0.10 | Local SQLite, no ORM (`db/initialize.ts`) |
| `@react-native-async-storage/async-storage` | ^2.2.0 | Language preference (`utils/i18n.ts`) and other simple keys |

## Maps and location

| Package | Version | Use |
|---|---|---|
| `react-native-maps` | 1.20.1 | Map (Google Maps) |
| `expo-location` | ~19.0.8 | GPS |
| `expo-linking` | ~8.0.12 | Deep linking |

## Media (photos, audio)

| Package | Version | Use |
|---|---|---|
| `expo-image-picker` | ~17.0.11 | Photo selection/capture |
| `expo-image` | ~3.0.11 | Optimized image display |
| `expo-audio` | ~1.1.1 | Audio note recording |
| `expo-av` | ~16.0.8 | Audio/video playback |

## Files and compression

| Package | Version | Use |
|---|---|---|
| `expo-file-system` | ~19.0.23 | CSV/GeoJSON/media writing (`core/export/file-writer.ts`) |
| `expo-sharing` | ~14.0.8 | Sharing the exported file |
| `react-native-zip-archive` | ^7.0.2 | Compressing media into `.zip` on export |
| `expo-document-picker` | ^14.0.8 | File selection (e.g. catalog/CSV import) |

## i18n

| Package | Version | Use |
|---|---|---|
| `i18n-js` | ^4.5.1 | Present as a dependency, but the real translation implementation is hand-rolled (`utils/i18n.ts`), see [08_I18N.md](08_I18N.md) |
| `expo-localization` | ~17.0.9 | Device language detection |

Supported languages: pt (primary), en, es, fr (`locales/{pt,en,es,fr}.json`).

## Security and auxiliary storage

| Package | Version | Use |
|---|---|---|
| `expo-secure-store` | ~15.0.8 | GBIF/SpeciesLink API keys (`core/species-catalog/api-key-manager.ts`) |
| `@react-native-community/netinfo` | 11.4.1 | Connectivity state |

## Other relevant Expo dependencies

`expo-constants`, `expo-haptics`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-updates`, `expo-web-browser`, `expo-symbols`, `expo-dev-client`, `expo-asset`, `expo-font`.

`dotenv` (^17.4.0) loads environment variables only in `app.config.js` (build time), not at app runtime.

## License

The repository moved from **CC BY-NC 4.0** to **GNU GPL v3.0** (`LICENSE` file at the repository root, outside `mobile-app/`). `package.json` doesn't declare its own `license` field.

## Testing and quality

| Package | Version | Use |
|---|---|---|
| `jest` (dev) | ^29.7.0 | Test runner |
| `ts-jest` (dev) | ^29.4.11 | TypeScript support in Jest |
| `@types/jest` (dev) | 29.5.14 | Types (pinned without `^`) |
| `eslint` (dev) | ^9.25.0 | Lint |
| `eslint-config-expo` (dev) | ~10.0.0 | Expo's lint config |

## Real scripts (`package.json`)

```json
{
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "web": "expo start --web",
  "lint": "expo lint",
  "test": "jest"
}
```

Build: EAS Build (`eas.json`), outside the scope of this runtime-dependency inventory.
