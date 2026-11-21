import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageDown, Loader2 } from "lucide-react";
import { IMAGE_FILE_NAMES, type ChartImage, type ImageKind } from "./imageCommon";
import { runImageDownload, type ImageDownloadState } from "./rasterize";

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition-all duration-200 hover:border-white/40 aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:border-white/15";

/**
 * Downloads the chart image the page is showing. `build` runs on click, so the image reflects the filters
 * at that moment; the button is inert (aria-disabled) while the image is rendered and a failure says so under the button.
 */
export function ImageDownloadButton({ kind, build }: { kind: ImageKind; build: () => Promise<ChartImage> }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ImageDownloadState>("idle");
  const busy = state === "busy";
  const Icon = busy ? Loader2 : ImageDown;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        className={BUTTON}
        aria-disabled={busy}
        aria-busy={busy}
        title={t(`chartImage.download.${kind}Aria`)}
        data-image-download={kind}
        onClick={() => {
          // aria-disabled keeps the keyboard focus on the button while the image is rendered.
          if (!busy) void runImageDownload(build, IMAGE_FILE_NAMES[kind], setState);
        }}
      >
        <Icon className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" />
        <span>{busy ? t("chartImage.download.busy") : t(`chartImage.download.${kind}`)}</span>
      </button>
      {state === "error" && (
        <p role="alert" data-image-download-error className="text-xs text-red-300">
          {t("chartImage.download.error")}
        </p>
      )}
    </div>
  );
}
