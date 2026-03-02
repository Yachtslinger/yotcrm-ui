"use client";

import { useEffect, useState, type ReactElement } from "react";

type StatusResponse = { isOn: boolean };
type ToggleResponse = { ok: boolean; state: "on" | "off" };

export default function YotcrmServiceToggle(): ReactElement {
  const [isOn, setIsOn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchStatus = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/yotcrm/status");
        if (!res.ok) {
          throw new Error("Status request failed");
        }
        const data = (await res.json()) as StatusResponse;
        if (active) {
          setIsOn(Boolean(data?.isOn));
        }
      } catch (err) {
        console.error("Failed to load YotCRM status", err);
        if (active) {
          setError("Unable to load service status.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      active = false;
    };
  }, []);

  const handleToggle = async (): Promise<void> => {
    if (isLoading) return;

    const nextState: "on" | "off" = isOn ? "off" : "on";
    const previous = isOn;

    setIsOn(nextState === "on");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/yotcrm/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state: nextState }),
      });

      if (!res.ok) {
        throw new Error("Toggle request failed");
      }

      const data = (await res.json()) as ToggleResponse;
      setIsOn(data.state === "on");
    } catch (err) {
      console.error("Unable to toggle YotCRM services", err);
      setIsOn(previous);
      setError("Unable to toggle services.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-xl p-4 flex items-center justify-between bg-white shadow-sm">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-slate-900">
          YotCRM Background Services
        </div>
        <div className="text-xs text-slate-500">
          {isOn ? "Running" : "Stopped"}
          {isLoading ? " • Working..." : ""}
        </div>
        {error ? <div className="text-xs text-red-600">{error}</div> : null}
      </div>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`px-4 py-2 rounded-full text-xs font-semibold transition ${
          isOn
            ? "bg-green-500 text-white hover:bg-green-600"
            : "bg-slate-200 text-slate-800 hover:bg-slate-300"
        } ${isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
        aria-pressed={isOn}
      >
        {isLoading ? "Working..." : isOn ? "ON" : "OFF"}
      </button>
    </div>
  );
}
