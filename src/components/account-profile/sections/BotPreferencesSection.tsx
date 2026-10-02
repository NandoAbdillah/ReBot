import React from "react";
import { Settings } from "lucide-react";
import { BotSettings } from "../types";

export interface BotPreferencesSectionProps {
  settings: BotSettings;
  setSettings: React.Dispatch<React.SetStateAction<BotSettings>>;
  saveSetting: (newSetting: BotSettings) => Promise<void>;
  isSaving: boolean;
}

export function BotPreferencesSection({
  settings,
  setSettings,
  saveSetting,
  isSaving,
}: BotPreferencesSectionProps) {
  return (
    <div className="cyber-card accent-top overflow-hidden flex flex-col lg:col-span-2">
      <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-center gap-2 border-b border-theme">
        <Settings size={15} className="text-accent" />
        <h3 className="text-sm font-bold text-1">Bot Settings</h3>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Anti-Spam Delay */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium w-full sm:w-40 shrink-0 text-1">
            Anti-Spam Delay
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.antiSpamDelay ?? 2000}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  antiSpamDelay: Number(e.target.value),
                }))
              }
              onBlur={() => saveSetting(settings)}
              disabled={isSaving}
              min={0}
              className="input-cyber w-28 h-10 sm:h-9 px-3 font-semibold disabled:opacity-60"
            />
            <span className="text-xs text-2">ms</span>
          </div>
        </div>

        <div className="h-px bg-theme border-t border-theme" />

        {/* Global Auto-Detect */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={(e) => {
            if (isSaving) return;
            if ((e.target as HTMLElement).closest("input")) return;
            saveSetting({
              ...settings,
              autoDetect: !settings.autoDetect,
            });
          }}
        >
          <div
            className={`toggle-track shrink-0 ${settings.autoDetect ? "active" : ""}`}
            style={{ opacity: isSaving ? 0.6 : 1 }}
          >
            <div className="toggle-thumb" />
          </div>
          <div>
            <p className="text-sm font-medium text-1">
              Global Auto-Detect
            </p>
            <p className="text-xs text-2">
              Balas semua pesan masuk dari target
            </p>
          </div>
        </div>

        <div className="h-px bg-theme border-t border-theme" />

        {/* Filter Paid Promote */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={(e) => {
            if (isSaving) return;
            if ((e.target as HTMLElement).closest("input")) return;
            saveSetting({
              ...settings,
              requireEmojiPrefix: !settings.requireEmojiPrefix,
            });
          }}
        >
          <div
            className={`toggle-track shrink-0 ${settings.requireEmojiPrefix ? "active" : ""}`}
            style={{ opacity: isSaving ? 0.6 : 1 }}
          >
            <div className="toggle-thumb" />
          </div>
          <div>
            <p className="text-sm font-medium text-1">
              Filter Paid Promote (Wajib Emoji)
            </p>
            <p className="text-xs text-2">
              Abaikan pesan yang depannya huruf/bukan emoji
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export default BotPreferencesSection;
