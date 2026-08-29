import "server-only";

import type { ReverseGeocodeResult } from "@/lib/report/schema";

/*
 * Reverse geocoding: GPS coordinates -> a human-readable location.
 *
 * A GeocodingProvider interface so a paid provider can be substituted behind
 * it later without touching any caller. The one real implementation today is
 * OpenStreetMap's Nominatim — no API key needed at this call volume (one
 * lookup per report, on demand, never on a background timer), which matters
 * because the alternative would be inventing a GEOCODING_API_KEY nobody has.
 *
 * Nominatim's usage policy requires a real, identifying User-Agent and caps
 * unauthenticated use at roughly one request per second — both satisfied
 * here by construction (a single request per call, from a server, never
 * looped).
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "CivicAI/0.1 (civic complaint reporting, contact: support@civicai.example)";
const TIMEOUT_MS = 6000;

export interface GeocodingProvider {
  reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null>;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  neighbourhood?: string;
  county?: string;
  state?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
}

class NominatimGeocodingProvider implements GeocodingProvider {
  /**
   * Returns null on any failure — never a guessed or fabricated address.
   * The caller falls back to showing raw coordinates or asking the citizen
   * to enter the location themselves.
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult | null> {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as NominatimResponse;
      const address = data.address ?? {};
      const city = address.city ?? address.town ?? address.village ?? null;
      const area = address.suburb ?? address.neighbourhood ?? null;

      if (!data.display_name && !city) return null;

      return {
        formattedAddress: data.display_name ?? null,
        city,
        area,
      };
    } catch (error) {
      console.error(
        "[reverse-geocode] request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getGeocodingProvider(): GeocodingProvider {
  return new NominatimGeocodingProvider();
}
