/**
 * API Configuration and Key Management
 * Stores API keys for external services (GBIF, SpeciesLink, etc.)
 * Uses expo-secure-store for encrypted storage on device.
 */

import * as SecureStore from 'expo-secure-store';

const STORAGE_KEYS = {
  SPECIESLINK_API_KEY: 'nomos_specieslink_api_key',
  GBIF_API_KEY: 'nomos_gbif_api_key',
};

export class APIKeyManager {
  static async setSpeciesLinkApiKey(apiKey: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.SPECIESLINK_API_KEY, apiKey);
    } catch (error) {
      console.error('Error storing SpeciesLink API key:', error);
      throw error;
    }
  }

  static async getSpeciesLinkApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.SPECIESLINK_API_KEY);
    } catch (error) {
      console.error('Error retrieving SpeciesLink API key:', error);
      return null;
    }
  }

  static async removeSpeciesLinkApiKey(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SPECIESLINK_API_KEY);
    } catch (error) {
      console.error('Error removing SpeciesLink API key:', error);
      throw error;
    }
  }

  static async hasSpeciesLinkApiKey(): Promise<boolean> {
    const key = await this.getSpeciesLinkApiKey();
    return !!key;
  }

  static async setGBIFApiKey(apiKey: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.GBIF_API_KEY, apiKey);
    } catch (error) {
      console.error('Error storing GBIF API key:', error);
      throw error;
    }
  }

  static async getGBIFApiKey(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(STORAGE_KEYS.GBIF_API_KEY);
    } catch (error) {
      console.error('Error retrieving GBIF API key:', error);
      return null;
    }
  }
}
