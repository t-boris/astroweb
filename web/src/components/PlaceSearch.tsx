import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

interface PhotonProperties {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  countrycode?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }; // [lon, lat] — NOTE: lon first!
  properties: PhotonProperties;
}

interface PlaceSearchProps {
  onSelect: (place: { name: string; lat: number; lng: number }) => void;
  initialValue?: string;
}

const PHOTON_URL = "https://photon.komoot.io/api";
const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

function formatPlaceName(props: PhotonProperties): string {
  const parts = [props.name, props.state, props.country].filter(Boolean);
  return parts.join(", ");
}

export default function PlaceSearch({ onSelect, initialValue }: PlaceSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialValue || "");
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const search = useCallback(async (q: string, signal: AbortSignal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ q, lang: "en", limit: "5" });
      const response = await fetch(`${PHOTON_URL}?${params}`, { signal });
      if (signal.aborted) return;
      const data = await response.json();
      setResults(data.features || []);
      setHasSearched(true);
      setIsOpen(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResults([]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);

    // Abort previous request
    controllerRef.current?.abort();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (value.length < MIN_CHARS) {
      setResults([]);
      setIsOpen(false);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    controllerRef.current = controller;

    timeoutRef.current = setTimeout(() => {
      search(value, controller.signal);
    }, DEBOUNCE_MS);
  }

  function handleSelect(feature: PhotonFeature) {
    const [lon, lat] = feature.geometry.coordinates; // lon first in GeoJSON!
    const displayName = formatPlaceName(feature.properties);
    setQuery(displayName);
    setIsOpen(false);
    setResults([]);
    onSelect({ name: displayName, lat, lng: lon });
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={t("profile.form.searchPlace")}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
      />

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t("profile.form.searching")}
            </div>
          )}
          {!loading && hasSearched && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {t("profile.form.noResults")}
            </div>
          )}
          {results.map((feature, idx) => {
            const displayName = formatPlaceName(feature.properties);
            return (
              <button
                key={idx}
                type="button"
                className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleSelect(feature)}
              >
                {displayName}
              </button>
            );
          })}
        </div>
      )}

      {!isOpen && query.length > 0 && query.length < MIN_CHARS && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("profile.form.minChars")}
        </p>
      )}
    </div>
  );
}
