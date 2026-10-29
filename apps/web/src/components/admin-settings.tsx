"use client";

import { useEffect, useState, type FormEvent } from "react";

type Settings = {
  plannerEnabled: boolean;
  defaultProvider: string;
  defaultModel: string;
  updatedAt: string;
};

const initialSettings: Settings = {
  plannerEnabled: true,
  defaultProvider: "openai",
  defaultModel: "gpt-4o-mini",
  updatedAt: "",
};

export function AdminSettings() {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState("Loading settings…");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load settings.");
        return response.json() as Promise<Settings>;
      })
      .then((value) => {
        setSettings(value);
        setStatus("");
      })
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not load settings."));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving…");
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setStatus("Could not save settings.");
      return;
    }
    const saved = await response.json() as Settings;
    setSettings(saved);
    setStatus("Saved.");
  }

  return (
    <form className="settings-card" onSubmit={save}>
      <label>
        <span>Default provider</span>
        <select
          value={settings.defaultProvider}
          onChange={(event) => setSettings({ ...settings, defaultProvider: event.target.value })}
        >
          <option value="openai">OpenAI</option>
        </select>
      </label>
      <label>
        <span>Default model</span>
        <input
          required
          value={settings.defaultModel}
          onChange={(event) => setSettings({ ...settings, defaultModel: event.target.value })}
        />
      </label>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.plannerEnabled}
          onChange={(event) => setSettings({ ...settings, plannerEnabled: event.target.checked })}
        />
        <span>Enable AI planner</span>
      </label>
      <p className="settings-note">Set provider API keys in server secrets, never in this panel.</p>
      <button type="submit">Save settings</button>
      <p className="settings-status" role="status">{status}</p>
    </form>
  );
}
