import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const defaultSettings = {
  default_rate_limit: 100,
  cooldown_duration_seconds: 300,
  max_retries: 3,
  log_retention_days: 30,
};

const SettingsPage = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(defaultSettings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          const merged = { ...defaultSettings };
          data.forEach((s) => {
            if (s.setting_key in merged) {
              (merged as any)[s.setting_key] = (s.setting_value as any).value ?? (s.setting_value as any);
            }
          });
          setSettings(merged);
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const upserts = Object.entries(settings).map(([key, value]) => ({
      user_id: user.id,
      setting_key: key,
      setting_value: { value },
    }));

    for (const item of upserts) {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("user_id", user.id)
        .eq("setting_key", item.setting_key)
        .maybeSingle();

      if (existing) {
        await supabase.from("system_settings").update({ setting_value: item.setting_value }).eq("id", existing.id);
      } else {
        await supabase.from("system_settings").insert(item);
      }
    }

    toast.success("Pengaturan berhasil disimpan!");
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">System Settings</h1>
        <p className="text-sm text-muted-foreground">Konfigurasi global untuk gateway</p>
      </div>

      <div className="card-elevated max-w-lg rounded-xl border border-border p-6">
        <div className="space-y-5">
          <div>
            <Label className="text-foreground">Default Rate Limit (req/menit)</Label>
            <Input
              type="number"
              value={settings.default_rate_limit}
              onChange={(e) => setSettings({ ...settings, default_rate_limit: parseInt(e.target.value) || 0 })}
              className="border-border bg-secondary text-foreground"
            />
          </div>
          <div>
            <Label className="text-foreground">Cooldown Duration (detik)</Label>
            <Input
              type="number"
              value={settings.cooldown_duration_seconds}
              onChange={(e) => setSettings({ ...settings, cooldown_duration_seconds: parseInt(e.target.value) || 0 })}
              className="border-border bg-secondary text-foreground"
            />
          </div>
          <div>
            <Label className="text-foreground">Max Retries</Label>
            <Input
              type="number"
              value={settings.max_retries}
              onChange={(e) => setSettings({ ...settings, max_retries: parseInt(e.target.value) || 0 })}
              className="border-border bg-secondary text-foreground"
            />
          </div>
          <div>
            <Label className="text-foreground">Log Retention (hari)</Label>
            <Input
              type="number"
              value={settings.log_retention_days}
              onChange={(e) => setSettings({ ...settings, log_retention_days: parseInt(e.target.value) || 0 })}
              className="border-border bg-secondary text-foreground"
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
