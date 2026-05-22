import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { motion } from "framer-motion";
import { useDeviceId } from "@/hooks/useDeviceId";
import { createProfile, getProfile, updateProfile } from "@/api/profiles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PlaceSearch from "@/components/PlaceSearch";
import { Astrolabe } from "@/components/Astrolabe";

export default function ProfileCreate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deviceId = useDeviceId();
  const isEdit = Boolean(id);

  // Form state
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthPlace, setBirthPlace] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadRetryCount, setLoadRetryCount] = useState(0);

  function getErrorMessage(err: unknown, fallbackKey: string): string {
    if (err instanceof FirebaseError) {
      if (err.message.includes("not-found")) return t("errors.profileNotFound");
      if (err.message.includes("permission-denied")) return t("errors.permissionDenied");
      if (err.message.includes("invalid-argument")) return t("errors.profileSaveFailed");
    }
    return t(fallbackKey);
  }

  // Load profile data for edit mode
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;

    async function load() {
      try {
        const profile = await getProfile(id!, deviceId);
        if (cancelled) return;
        setName(profile.name);
        setBirthDate(profile.birthDate);
        setBirthTime(profile.birthTime || "");
        setTimeUnknown(profile.timeUnknown);
        setBirthPlace(profile.birthPlace);
        setLat(profile.lat);
        setLng(profile.lng);
      } catch (err) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err, "errors.unknownError"));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id, deviceId, loadRetryCount]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = t("profile.validation.nameRequired");
    } else if (name.length > 100) {
      newErrors.name = t("profile.validation.nameMaxLength");
    }

    if (!birthDate) {
      newErrors.birthDate = t("profile.validation.birthDateRequired");
    }

    if (!timeUnknown && !birthTime) {
      newErrors.birthTime = t("profile.validation.birthTimeRequired");
    }

    if (!birthPlace || lat === null || lng === null) {
      newErrors.birthPlace = t("profile.validation.birthPlaceRequired");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors({});

    try {
      if (isEdit && id) {
        await updateProfile(id, {
          ownerDeviceId: deviceId,
          name,
          birthDate,
          birthTime: timeUnknown ? null : birthTime,
          timeUnknown,
          birthPlace,
          lat: lat!,
          lng: lng!,
        });
        navigate(`/profile/${id}`);
      } else {
        const result = await createProfile({
          ownerDeviceId: deviceId,
          name,
          birthDate,
          birthTime: timeUnknown ? null : birthTime,
          timeUnknown,
          birthPlace,
          lat: lat!,
          lng: lng!,
          // timezone omitted — server resolves from lat/lng
        });
        navigate(`/profile/${result.id}`);
      }
    } catch (err) {
      const msg = getErrorMessage(err, "errors.profileSaveFailed");
      setErrors({ form: msg });
    } finally {
      setSaving(false);
    }
  }

  function handleTimeUnknownChange(checked: boolean) {
    setTimeUnknown(checked);
    if (checked) {
      setBirthTime("");
    }
  }

  function handlePlaceSelect(place: {
    name: string;
    lat: number;
    lng: number;
  }) {
    setBirthPlace(place.name);
    setLat(place.lat);
    setLng(place.lng);
    // Clear place validation error when a place is selected
    setErrors((prev) => {
      const { birthPlace: _, ...rest } = prev;
      return rest;
    });
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{loadError}</p>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={() => { setLoadError(null); setLoadRetryCount(c => c + 1); }}>
            {t("errors.retry")}
          </Button>
          <Link to="/" className="text-primary hover:underline">
            {t("profile.create.back")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 max-w-2xl mx-auto space-y-6">
      {/* Background Astrolabe */}
      <div className="fixed top-0 right-0 w-[150vw] h-[150vw] sm:w-[80vw] sm:h-[80vw] max-w-[800px] max-h-[800px] translate-x-1/4 -translate-y-1/4 opacity-10 pointer-events-none -z-10">
        <Astrolabe className="w-full h-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <Card className="art-deco-card">
          <CardHeader className="border-b border-primary/20">
            <CardTitle className="font-serif text-primary">
              {isEdit ? t("profile.edit.title") : t("profile.create.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">{t("profile.form.name")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("profile.form.namePlaceholder")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>

              {/* Birth Date */}
              <div className="space-y-2">
                <Label htmlFor="birthDate">{t("profile.form.birthDate")}</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
                {errors.birthDate && (
                  <p className="text-sm text-destructive">{errors.birthDate}</p>
                )}
              </div>

              {/* Time Unknown + Birth Time */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Switch
                    id="timeUnknown"
                    checked={timeUnknown}
                    onCheckedChange={handleTimeUnknownChange}
                  />
                  <Label htmlFor="timeUnknown">
                    {t("profile.form.timeUnknown")}
                  </Label>
                </div>

                {!timeUnknown && (
                  <div className="space-y-2">
                    <Label htmlFor="birthTime">{t("profile.form.birthTime")}</Label>
                    <Input
                      id="birthTime"
                      type="time"
                      value={birthTime}
                      onChange={(e) => setBirthTime(e.target.value)}
                    />
                    {errors.birthTime && (
                      <p className="text-sm text-destructive">{errors.birthTime}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Birth Place (PlaceSearch) */}
              <div className="space-y-2">
                <Label>{t("profile.form.birthPlace")}</Label>
                <PlaceSearch
                  onSelect={handlePlaceSelect}
                  initialValue={isEdit ? birthPlace : undefined}
                  selectedLat={lat}
                  selectedLng={lng}
                />
                {errors.birthPlace && (
                  <p className="text-sm text-destructive">{errors.birthPlace}</p>
                )}
              </div>

              {/* Coordinates preview (read-only) */}
              {lat !== null && lng !== null && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium">{t("profile.form.coordinates")}:</span>{" "}
                  {lat.toFixed(4)}, {lng.toFixed(4)}
                </div>
              )}

              {/* Form-level error */}
              {errors.form && (
                <p className="text-sm text-destructive">{errors.form}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? t("profile.form.saving") : t("common.save")}
                </Button>
                <Link to="/" className="text-primary hover:underline">
                  {t("profile.create.back")}
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
