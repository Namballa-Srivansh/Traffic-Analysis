"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Lightbulb,
  Zap,
  Leaf,
  CloudRain,
  CloudFog,
  Moon,
  Sun,
  Sliders,
  Car,
  Truck,
  RotateCcw,
  Play,
  Pause,
  Info,
  Radio,
  Activity,
  CheckCircle2,
  TrendingDown,
  Power,
  Flame,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  Maximize2,
  X,
  Gauge,
  Clock,
  DollarSign,
  AlertTriangle
} from "lucide-react";

export interface StreetlightSimulationProps {
  syncedTrafficCount?: number;
  isLiveVideo?: boolean;
  currentTime?: number;
  videoDuration?: number;
  timeline?: Array<{ timeSec: number; activeCount: number; classes?: Record<string, number> }>;
  onSeek?: (time: number) => void;
  className?: string;
}

interface SimulatedVehicle {
  id: number;
  type: "car" | "truck" | "bus" | "motorcycle";
  x: number; // percentage from -10 to 110
  lane: number; // 0 (top eastbound) or 1 (bottom eastbound)
  speed: number; // speed across canvas
  color: string;
  length: number;
}

interface PoleData {
  id: number;
  name: string;
  xPercent: number; // position along road (e.g. 10%, 26%, 42%, 58%, 74%, 90%)
  individualBrightness: number;
  sensorTriggered: boolean;
  targetLux: number;
  tempCelsius: number;
  powerWatts: number;
}

export default function StreetlightSimulation({
  syncedTrafficCount = 0,
  isLiveVideo = false,
  currentTime = 0,
  videoDuration = 0,
  timeline,
  onSeek,
  className = "",
}: StreetlightSimulationProps) {
  // Mode: "sync" (tracks video/image detections) vs "manual" (interactive sandbox)
  const [controlMode, setControlMode] = useState<"sync" | "manual">(
    isLiveVideo || syncedTrafficCount > 0 ? "sync" : "manual"
  );

  // Manual sandbox state
  const [manualDensity, setManualDensity] = useState<number>(syncedTrafficCount || 4);
  const [profile, setProfile] = useState<"eco" | "balanced" | "safety">("balanced");
  const [weather, setWeather] = useState<"clear" | "rain" | "fog">("clear");
  const [isSimulationPlaying, setIsSimulationPlaying] = useState<boolean>(true);
  const [selectedPoleId, setSelectedPoleId] = useState<number | null>(3);
  const [holdTimerSec, setHoldTimerSec] = useState<number>(0);

  // Smoothed brightness level (0 - 100%) for realistic DALI dimming transition
  const [currentBrightness, setCurrentBrightness] = useState<number>(20);
  const [targetBrightness, setTargetBrightness] = useState<number>(20);

  // Vehicles moving along the 2D road canvas
  const [vehicles, setVehicles] = useState<SimulatedVehicle[]>([]);
  const nextVehicleId = useRef<number>(1);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  // Cumulative energy analytics
  const [cumulativeKwhSaved, setCumulativeKwhSaved] = useState<number>(0.082);
  const [simulationRuntimeSec, setSimulationRuntimeSec] = useState<number>(0);

  // Effective vehicle count determining streetlight intensity
  const effectiveVehicleCount = controlMode === "sync" ? syncedTrafficCount : manualDensity;

  // Dimming Profile parameters
  const profileConfig = useMemo(() => {
    switch (profile) {
      case "eco":
        return { idle: 15, max: 75, name: "Ultra Eco Mode", desc: "Max conservation for low-pedestrian rural or bypass routes" };
      case "safety":
        return { idle: 30, max: 100, name: "High Safety Priority", desc: "High illumination for intersections, pedestrian crossings & highways" };
      case "balanced":
      default:
        return { idle: 20, max: 85, name: "Smart Balanced (Standard)", desc: "Optimized balance of security, visual comfort & 70%+ energy conservation" };
    }
  }, [profile]);

  // Compute calculated target brightness based on vehicle count & environmental factors
  useEffect(() => {
    let target = profileConfig.idle;

    if (effectiveVehicleCount === 0) {
      target = profileConfig.idle;
    } else if (effectiveVehicleCount === 1) {
      target = profileConfig.idle + 25; // Solitary vehicle trigger
    } else if (effectiveVehicleCount <= 3) {
      target = profileConfig.idle + 40; // Low density
    } else if (effectiveVehicleCount <= 8) {
      target = profileConfig.idle + 55; // Moderate traffic
    } else {
      target = profileConfig.max; // Heavy saturation
    }

    // Weather adjustments (rain / fog requires higher lumens for driver visibility)
    if (weather === "rain") target = Math.min(100, target + 15);
    if (weather === "fog") target = Math.min(100, target + 20);

    // Clamp between idle and max
    target = Math.min(100, Math.max(profileConfig.idle, target));
    setTargetBrightness(target);

    // If vehicles are present, reset hold timer; if 0, start safety delay
    if (effectiveVehicleCount > 0) {
      setHoldTimerSec(3.5);
    }
  }, [effectiveVehicleCount, profileConfig, weather]);

  // Smooth exponential/linear dimming slew rate (simulating DALI-2 LED driver fade time)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBrightness((prev) => {
        // If hold timer is active and target is lower than current, hold elevated light
        if (effectiveVehicleCount === 0 && holdTimerSec > 0) {
          setHoldTimerSec((h) => Math.max(0, h - 0.1));
          return prev;
        }

        const delta = targetBrightness - prev;
        if (Math.abs(delta) < 0.4) return targetBrightness;

        // Realistic slew rate: ramps up faster for safety (~25%/s), fades down slower (~15%/s)
        const step = delta > 0 ? 2.5 : 1.2;
        return Number((prev + Math.sign(delta) * Math.min(Math.abs(delta), step)).toFixed(1));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [targetBrightness, effectiveVehicleCount, holdTimerSec]);

  // Energy & Power Calculations
  // Baseline: 6 conventional unmanaged sodium/LED fixtures running at 100% constant (150W each = 900W total)
  const POLE_COUNT = 6;
  const WATTAGE_PER_POLE = 150;
  const BASELINE_TOTAL_WATTS = POLE_COUNT * WATTAGE_PER_POLE; // 900 Watts

  const currentTotalWatts = Math.round(POLE_COUNT * WATTAGE_PER_POLE * (currentBrightness / 100));
  const instantaneousWattsSaved = BASELINE_TOTAL_WATTS - currentTotalWatts;
  const percentPowerSaved = Math.round(((BASELINE_TOTAL_WATTS - currentTotalWatts) / BASELINE_TOTAL_WATTS) * 100);

  // Environmental impact multipliers
  // 1 kWh saved = ~0.82 kg CO2 reduction
  // Average electricity rate = $0.15 / kWh (~₹12.50 / kWh)
  useEffect(() => {
    const timer = setInterval(() => {
      setSimulationRuntimeSec((s) => s + 1);
      // Accumulate kWh saved: (watts saved / 1000) * (1 / 3600) per second
      setCumulativeKwhSaved((prev) => prev + (instantaneousWattsSaved / 1000 / 3600));
    }, 1000);

    return () => clearInterval(timer);
  }, [instantaneousWattsSaved]);

  const co2SavedKg = Number((cumulativeKwhSaved * 0.82).toFixed(3));
  const costSavedDollars = Number((cumulativeKwhSaved * 0.15).toFixed(2));
  const costSavedRupees = Number((cumulativeKwhSaved * 12.5).toFixed(1));

  // Streetlight Pole layout along the corridor
  const polePositions = [10, 26, 42, 58, 74, 90];

  const poles: PoleData[] = useMemo(() => {
    return polePositions.map((xPos, idx) => {
      const poleId = idx + 1;
      // Check if any vehicle is within proximity (+/- 12%) of this pole
      const nearVehicle = vehicles.some((v) => Math.abs(v.x - xPos) < 14);
      const isTriggered = nearVehicle || effectiveVehicleCount > 0;

      // Base individual brightness with slight local proximity boost
      const indBrightness = nearVehicle
        ? Math.min(100, currentBrightness + 10)
        : currentBrightness;

      // Calculate Lux on road pavement (15 Lux idle up to 110 Lux high)
      const targetLux = Math.round(15 + (indBrightness / 100) * 95);
      // Calculate heat / junction temperature: 38C idle up to 68C at 100%
      const tempCelsius = Math.round(36 + (indBrightness / 100) * 32);
      const powerWatts = Math.round(WATTAGE_PER_POLE * (indBrightness / 100));

      return {
        id: poleId,
        name: `Pole ST-${poleId.toString().padStart(2, "0")}`,
        xPercent: xPos,
        individualBrightness: indBrightness,
        sensorTriggered: isTriggered,
        targetLux,
        tempCelsius,
        powerWatts,
      };
    });
  }, [vehicles, currentBrightness, effectiveVehicleCount]);

  // Selected Pole detailed info
  const activePoleData = poles.find((p) => p.id === (selectedPoleId || 3)) || poles[2];

  // Initialize and spawn simulated vehicles
  useEffect(() => {
    // Synchronize vehicle count on the canvas with the target density
    const targetCount = Math.min(12, Math.max(0, effectiveVehicleCount));

    setVehicles((current) => {
      if (current.length === targetCount) return current;

      if (current.length < targetCount) {
        // Spawn additional vehicles
        const needed = targetCount - current.length;
        const newOnes: SimulatedVehicle[] = [];
        const vehicleTypes: Array<"car" | "truck" | "bus" | "motorcycle"> = [
          "car",
          "car",
          "truck",
          "car",
          "bus",
          "motorcycle",
        ];
        const colors = ["#38bdf8", "#ef4444", "#10b981", "#fbbf24", "#a855f7", "#f97316"];

        for (let i = 0; i < needed; i++) {
          const type = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
          newOnes.push({
            id: nextVehicleId.current++,
            type,
            // Space out starting positions across the road
            x: (i * (100 / Math.max(1, needed))) % 100,
            lane: Math.random() > 0.5 ? 0 : 1,
            speed: type === "motorcycle" ? 0.38 : type === "car" ? 0.3 : type === "truck" ? 0.22 : 0.2,
            color: colors[Math.floor(Math.random() * colors.length)],
            length: type === "truck" || type === "bus" ? 38 : type === "motorcycle" ? 14 : 26,
          });
        }
        return [...current, ...newOnes];
      } else {
        // Trim vehicles smoothly
        return current.slice(0, targetCount);
      }
    });
  }, [effectiveVehicleCount]);

  // Vehicle animation loop
  useEffect(() => {
    let active = true;

    const animate = (time: number) => {
      const dt = (time - lastTimeRef.current) / 16.66; // Normalize to 60fps delta
      lastTimeRef.current = time;

      if (isSimulationPlaying) {
        setVehicles((prev) =>
          prev.map((v) => {
            let nextX = v.x + v.speed * Math.max(0.4, Math.min(2.0, dt));
            if (nextX > 115) {
              // Wrap around from left side with slight random lane & speed variance
              nextX = -12;
            }
            return { ...v, x: nextX };
          })
        );
      }

      if (active) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isSimulationPlaying]);

  // Spawn vehicle manually
  const spawnSpecificVehicle = (type: "car" | "truck" | "bus" | "motorcycle") => {
    setControlMode("manual");
    setManualDensity((prev) => Math.min(20, prev + 1));
    const colors = ["#38bdf8", "#ef4444", "#10b981", "#fbbf24", "#a855f7", "#f97316"];
    setVehicles((prev) => [
      ...prev,
      {
        id: nextVehicleId.current++,
        type,
        x: -8,
        lane: Math.random() > 0.5 ? 0 : 1,
        speed: type === "motorcycle" ? 0.38 : type === "car" ? 0.3 : type === "truck" ? 0.22 : 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        length: type === "truck" || type === "bus" ? 38 : type === "motorcycle" ? 14 : 26,
      },
    ]);
  };

  const handleClearVehicles = () => {
    setControlMode("manual");
    setManualDensity(0);
    setVehicles([]);
  };

  // Status tier labels
  const getBrightnessTier = (b: number) => {
    if (b <= 25) {
      return {
        label: "DIM - IDLE ECO",
        badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
        glowColor: "rgba(16, 185, 129, 0.25)",
        desc: "Minimal security glow. Conserving 75-85% electric grid power.",
      };
    }
    if (b <= 55) {
      return {
        label: "LOW COMMUTER FLOW",
        badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
        glowColor: "rgba(6, 182, 212, 0.35)",
        desc: "Smooth ramp-up providing safe headway for solitary vehicles.",
      };
    }
    if (b <= 80) {
      return {
        label: "MODERATE CORRIDOR",
        badge: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        glowColor: "rgba(245, 158, 11, 0.45)",
        desc: "High clarity illumination matching active multi-lane commuter transit.",
      };
    }
    return {
      label: "FULL BEAM - HIGH TRAFFIC",
      badge: "bg-rose-500/10 text-rose-300 border-rose-500/20",
      glowColor: "rgba(244, 63, 94, 0.55)",
      desc: "Maximum lumen output for saturated traffic flow & maximum road safety.",
    };
  };

  const currentTier = getBrightnessTier(currentBrightness);

  return (
    <div className={`flex flex-col space-y-6 ${className}`}>

      {/* Main Simulation Container */}
      <div className="relative rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800/90 p-5 md:p-6 shadow-2xl overflow-hidden backdrop-blur-xl">

        {/* Ambient Top Glow reflecting current Streetlight Dimming */}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-3/4 h-64 rounded-full blur-[140px] pointer-events-none transition-all duration-700"
          style={{
            backgroundColor:
              currentBrightness > 75
                ? "rgba(251, 191, 36, 0.22)"
                : currentBrightness > 45
                  ? "rgba(6, 182, 212, 0.18)"
                  : "rgba(16, 185, 129, 0.12)",
          }}
        />

        {/* Header Bar */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between pb-5 mb-5 border-b border-slate-800/80 gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-cyan-500/20 border border-amber-400/30 text-amber-400 shadow-lg shadow-amber-500/10">
              <Lightbulb className="w-6 h-6 animate-pulse" />
              <span
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 transition-colors"
                style={{
                  backgroundColor: currentBrightness > 60 ? "#f59e0b" : "#10b981",
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg md:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  Smart Streetlight Adaptive Dimming System
                </h3>
                <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${currentTier.badge}`}>
                  {currentTier.label}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Dynamic LED Luminaire Dimming Synced with Computer Vision Traffic Density
              </p>
            </div>
          </div>

          {/* Mode Switcher: Synced vs Interactive Sandbox */}
          <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => {
                setControlMode("sync");
                if (syncedTrafficCount) setManualDensity(syncedTrafficCount);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${controlMode === "sync"
                ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-white"
                }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>AI Vision Sync</span>
              {isLiveVideo && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-1" />
              )}
            </button>

            <button
              onClick={() => setControlMode("manual")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${controlMode === "manual"
                ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-white"
                }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Interactive Sandbox</span>
            </button>
          </div>
        </div>

        {/* Mode Sync Alert Banner */}
        {controlMode === "sync" && (
          <div className="relative z-10 mb-4 px-4 py-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>
                <strong>Autonomous Mode Active:</strong> Streetlights are continuously calibrated to the{" "}
                {isLiveVideo ? "real-time video playback stream" : "analyzed traffic frame"}{" "}
                (<strong>{syncedTrafficCount} detected vehicles</strong>).
              </span>
            </div>
            {isLiveVideo && videoDuration > 0 && (
              <span className="text-[11px] font-mono text-cyan-300 bg-cyan-900/50 px-2 py-0.5 rounded border border-cyan-700/50">
                T: {currentTime.toFixed(1)}s / {videoDuration.toFixed(1)}s
              </span>
            )}
          </div>
        )}

        {/* 2D DIGITAL TWIN ROADWAY CANVAS & STREETLIGHT POLES */}
        <div className="relative z-10 mb-6">
          <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden bg-gradient-to-b from-[#040711] via-[#080d1e] to-[#0c1222] border border-slate-800 shadow-inner select-none">

            {/* Night Sky Backdrop with Twinkling Stars */}
            <div className="absolute inset-0 pointer-events-none opacity-70">
              <div className="absolute top-4 left-12 w-1 h-1 bg-white rounded-full animate-ping" />
              <div className="absolute top-10 left-1/4 w-1 h-1 bg-cyan-200 rounded-full opacity-60" />
              <div className="absolute top-6 left-1/2 w-1.5 h-1.5 bg-amber-100 rounded-full opacity-70" />
              <div className="absolute top-12 left-3/4 w-1 h-1 bg-white rounded-full opacity-80" />
              <div className="absolute top-8 right-16 w-1 h-1 bg-indigo-200 rounded-full animate-pulse" />
              {/* Crescent Moon */}
              <div className="absolute top-6 right-8 w-8 h-8 rounded-full border-2 border-amber-100/60 shadow-[0_0_15px_rgba(253,230,138,0.3)] bg-transparent">
                <div className="w-6 h-6 rounded-full bg-[#040711] -mt-1 -ml-1" />
              </div>
            </div>

            {/* Distant Urban Horizon Silhouette */}
            <div className="absolute bottom-36 left-0 right-0 h-16 pointer-events-none opacity-20 flex items-end justify-between px-4">
              <div className="w-12 h-10 bg-slate-700 rounded-t" />
              <div className="w-8 h-14 bg-slate-600 rounded-t" />
              <div className="w-16 h-8 bg-slate-700 rounded-t" />
              <div className="w-10 h-16 bg-slate-600 rounded-t" />
              <div className="w-14 h-12 bg-slate-700 rounded-t" />
              <div className="w-20 h-9 bg-slate-600 rounded-t" />
              <div className="w-12 h-14 bg-slate-700 rounded-t" />
              <div className="w-8 h-11 bg-slate-600 rounded-t" />
            </div>

            {/* Weather Overlay: Rain or Fog */}
            {weather === "rain" && (
              <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(105deg,transparent,transparent_10px,rgba(255,255,255,0.06)_11px,transparent_13px)] animate-pulse" />
            )}
            {weather === "fog" && (
              <div className="absolute inset-0 pointer-events-none bg-slate-400/10 backdrop-blur-[1px] transition-all duration-700" />
            )}

            {/* STREETLIGHT POLES & VOLUMETRIC LIGHT CONES */}
            <div className="absolute inset-0 pointer-events-none">
              {poles.map((pole) => {
                const isSelected = selectedPoleId === pole.id;
                // Brightness ratio (0.15 to 1.0)
                const bFactor = pole.individualBrightness / 100;

                // Color temperature shifts: 20% -> soft warm gold (3000K), 100% -> bright crisp white-amber (4500K)
                const lightConeColor =
                  pole.individualBrightness > 75
                    ? "rgba(254, 243, 199, "
                    : pole.individualBrightness > 45
                      ? "rgba(253, 230, 138, "
                      : "rgba(245, 158, 11, ";

                return (
                  <div
                    key={pole.id}
                    className="absolute top-0 bottom-0 pointer-events-auto cursor-pointer"
                    style={{ left: `${pole.xPercent}%`, transform: "translateX(-50%)" }}
                    onClick={() => setSelectedPoleId(pole.id)}
                    title={`Click to inspect ${pole.name} telemetry`}
                  >
                    {/* Volumetric Light Cone projecting downward onto the road */}
                    <div
                      className="absolute top-16 left-1/2 -translate-x-1/2 w-48 sm:w-64 h-64 pointer-events-none transition-all duration-500 ease-out"
                      style={{
                        opacity: 0.15 + bFactor * 0.75,
                        filter: `blur(${16 - bFactor * 8}px)`,
                        background: `conic-gradient(from 150deg at 50% 0%, transparent 0deg, ${lightConeColor}${0.35 + bFactor * 0.45}) 30deg, transparent 60deg)`,
                      }}
                    />

                    {/* Ground Illumination Pool (Elliptical Glow on Asphalt) */}
                    <div
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${80 + bFactor * 140}px`,
                        height: `${32 + bFactor * 38}px`,
                        opacity: 0.2 + bFactor * 0.75,
                        backgroundColor:
                          pole.individualBrightness > 75
                            ? "rgba(254, 240, 138, 0.45)"
                            : pole.individualBrightness > 45
                              ? "rgba(253, 224, 71, 0.35)"
                              : "rgba(245, 158, 11, 0.25)",
                        boxShadow: `0 0 ${25 + bFactor * 45}px ${12 + bFactor * 25}px ${lightConeColor}${0.3 + bFactor * 0.45})`,
                      }}
                    />

                    {/* Wet asphalt specular reflection if rain is active */}
                    {weather === "rain" && (
                      <div
                        className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none rounded-full transition-all duration-500"
                        style={{
                          width: `${40 + bFactor * 70}px`,
                          height: "6px",
                          backgroundColor: "#ffffff",
                          opacity: 0.25 + bFactor * 0.45,
                          filter: "blur(4px)",
                        }}
                      />
                    )}

                    {/* PIR / IoT Sensor Ping Wave (Animated radar ripple when active) */}
                    {pole.sensorTriggered && (
                      <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none">
                        <div className="w-8 h-8 rounded-full border border-cyan-400/60 animate-ping" />
                      </div>
                    )}

                    {/* Streetlight Mast Structure */}
                    <div className="relative flex flex-col items-center h-full">

                      {/* Mast Top Lamp Luminaire Head */}
                      <div className="relative mt-8 flex items-center justify-center">
                        {/* Curved Cantilever Arm */}
                        <div className="w-8 h-2.5 border-t-2 border-r-2 border-slate-400 rounded-tr-lg mr-2" />

                        {/* Luminaire Fixture Casing */}
                        <div
                          className={`relative w-8 h-4 rounded-b-md border transition-all duration-300 flex items-center justify-center ${isSelected
                            ? "bg-slate-700 border-cyan-400 shadow-md shadow-cyan-400/40"
                            : "bg-slate-800 border-slate-600"
                            }`}
                        >
                          {/* Emitting LED Array Face */}
                          <div
                            className="w-6 h-2 rounded-sm transition-all duration-300"
                            style={{
                              backgroundColor:
                                pole.individualBrightness > 70
                                  ? "#fef08a"
                                  : pole.individualBrightness > 40
                                    ? "#fde047"
                                    : "#f59e0b",
                              boxShadow: `0 0 ${8 + bFactor * 16}px ${2 + bFactor * 6}px ${lightConeColor}${0.6 + bFactor * 0.4})`,
                            }}
                          />
                        </div>

                        {/* Smart Camera / PIR Motion Dome on Top */}
                        <div className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
                      </div>

                      {/* Vertical Metallic Pole */}
                      <div className="w-1.5 h-32 bg-gradient-to-r from-slate-400 via-slate-500 to-slate-700 rounded-t shadow" />

                      {/* Pole Pedestal Base */}
                      <div className="w-4 h-3 bg-slate-700 border-t border-slate-600 rounded-sm" />

                      {/* Pole Tag Badge */}
                      <div
                        className={`mt-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${isSelected
                          ? "bg-cyan-500 text-slate-950 scale-110 shadow-md"
                          : "bg-slate-900/90 text-slate-400 border border-slate-800"
                          }`}
                      >
                        P-{pole.id}
                      </div>

                      {/* Individual Brightness Pill */}
                      <span
                        className="text-[9px] font-mono mt-0.5 transition-colors font-semibold"
                        style={{
                          color:
                            pole.individualBrightness > 75
                              ? "#fef08a"
                              : pole.individualBrightness > 45
                                ? "#67e8f9"
                                : "#34d399",
                        }}
                      >
                        {Math.round(pole.individualBrightness)}%
                      </span>

                    </div>
                  </div>
                );
              })}
            </div>

            {/* ROADWAY PAVEMENT (Asphalt with Markings) */}
            <div className="absolute bottom-0 left-0 right-0 h-28 bg-[#131824] border-t-2 border-slate-700 flex flex-col justify-between overflow-hidden">
              {/* Top Road Shoulder / Curb */}
              <div className="h-1.5 bg-gradient-to-r from-slate-600 via-slate-700 to-slate-600 border-b border-slate-800" />

              {/* Lane Divider Markings (Dashed Highway Centerline) */}
              <div className="w-full h-1 border-b-2 border-dashed border-amber-400/60 my-auto" />

              {/* Bottom Road Shoulder / Curb */}
              <div className="h-2 bg-gradient-to-r from-slate-700 via-slate-800 to-slate-700 border-t border-slate-800" />

              {/* ANIMATED VEHICLES DRIVING ALONG THE ROAD */}
              <div className="absolute inset-0 pointer-events-none">
                {vehicles.map((v) => {
                  // Y-position based on lane
                  const topOffset = v.lane === 0 ? "26px" : "64px";

                  return (
                    <div
                      key={v.id}
                      className="absolute transition-transform duration-75 flex items-center"
                      style={{
                        left: `${v.x}%`,
                        top: topOffset,
                        transform: "translateY(-50%)",
                      }}
                    >
                      {/* Vehicle Body Representation */}
                      <div
                        className="relative rounded-md flex items-center justify-between px-1.5 shadow-lg border border-white/20"
                        style={{
                          width: `${v.length}px`,
                          height: v.type === "truck" || v.type === "bus" ? "20px" : "15px",
                          backgroundColor: v.color,
                        }}
                      >
                        {/* Cab / Windshield */}
                        <div className="w-2.5 h-full bg-slate-900/80 rounded-sm" />

                        {/* Front Headlights projecting beam forward */}
                        <div
                          className="absolute -right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                          style={{
                            width: "55px",
                            height: "24px",
                            background:
                              "conic-gradient(from 260deg at 0% 50%, rgba(254, 240, 138, 0.45) 0deg, transparent 40deg)",
                            filter: "blur(2px)",
                          }}
                        />

                        {/* Rear Taillights */}
                        <div className="absolute -left-1 top-1 w-1 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                        <div className="absolute -left-1 bottom-1 w-1 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* In-Canvas Mini HUD Overlay */}
            <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800/80 text-xs font-mono flex items-center gap-3 pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{
                    backgroundColor: currentBrightness > 60 ? "#f59e0b" : "#10b981",
                  }}
                />
                <span className="text-white font-bold">
                  LUMENS: {Math.round(currentBrightness)}%
                </span>
              </div>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400">
                ACTIVE VEHICLES: <strong className="text-cyan-400">{effectiveVehicleCount}</strong>
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400 font-semibold">
                POWER SAVED: {percentPowerSaved}%
              </span>
            </div>

            {/* Play / Pause simulation button */}
            <div className="absolute top-3 right-16">
              <button
                onClick={() => setIsSimulationPlaying(!isSimulationPlaying)}
                className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition"
                title={isSimulationPlaying ? "Pause Traffic Movement" : "Resume Traffic Movement"}
              >
                {isSimulationPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
            </div>

          </div>
        </div>

        {/* PRIMARY TELEMETRY GAUGES & REAL-TIME IMPACT METRICS */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

          {/* KPI 1: Live Brightness Level & Slew Status */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Streetlight Dimmer</span>
              <Lightbulb className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {Math.round(currentBrightness)}%
              </span>
              <span className="text-xs font-mono text-slate-400">
                (Target: {Math.round(targetBrightness)}%)
              </span>
            </div>
            {/* Smooth animated progress bar */}
            <div className="mt-2.5 w-full h-2 rounded-full bg-slate-900 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${currentBrightness}%`,
                  background:
                    currentBrightness > 75
                      ? "linear-gradient(to right, #f59e0b, #ef4444)"
                      : currentBrightness > 40
                        ? "linear-gradient(to right, #06b6d4, #f59e0b)"
                        : "linear-gradient(to right, #10b981, #06b6d4)",
                }}
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-400 truncate">
              {currentTier.desc}
            </div>
          </div>

          {/* KPI 2: Instant Power Demand vs Baseline */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Grid Power Draw</span>
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-cyan-300 tracking-tight">
                {currentTotalWatts}
              </span>
              <span className="text-xs font-mono text-slate-400">
                / {BASELINE_TOTAL_WATTS} Watts
              </span>
            </div>
            <div className="mt-2 text-xs font-bold text-emerald-400 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{percentPowerSaved}% Less Energy Consumed</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Saving {instantaneousWattsSaved} Watts across {POLE_COUNT} smart poles
            </div>
          </div>

          {/* KPI 3: Environmental CO2 Reduction */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Carbon Offset</span>
              <Leaf className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-300 tracking-tight">
                {co2SavedKg}
              </span>
              <span className="text-xs font-mono text-slate-400">kg CO₂</span>
            </div>
            <div className="mt-2 text-xs text-slate-300 font-medium">
              Cumulative: {(cumulativeKwhSaved * 1000).toFixed(1)} Wh saved
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Equivalent to ~{(cumulativeKwhSaved * 0.04).toFixed(2)} urban trees planted
            </div>
          </div>

          {/* KPI 4: Financial Cost Savings */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Municipal Savings</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white tracking-tight">
                ₹{costSavedRupees}
              </span>
              <span className="text-xs font-mono text-slate-400">
                (${costSavedDollars})
              </span>
            </div>
            <div className="mt-2 text-xs text-amber-300/90 font-medium">
              Projected: ₹{(costSavedRupees * 24 * 30).toFixed(0)} / month
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              LED fixture lifespan: <strong>85,000 hrs</strong> (+70% boost)
            </div>
          </div>

        </div>

        {/* INTERACTIVE CONTROLS & POLE INSPECTOR SPLIT */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5 border-t border-slate-800/80">

          {/* Left Column: Interactive Simulation Sandbox Controls */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Adaptive Dimming Sandbox Controls
              </h4>
              <span className="text-xs text-slate-400 font-mono">
                {controlMode === "manual" ? "Manual Override Enabled" : "Synced to Vision Engine"}
              </span>
            </div>

            {/* Traffic Density Slider */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <Car className="w-3.5 h-3.5 text-cyan-400" />
                  Traffic Density Simulation
                </label>
                <span className="text-xs font-mono font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800">
                  {effectiveVehicleCount} Vehicles in Corridor
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="25"
                step="1"
                value={effectiveVehicleCount}
                onChange={(e) => {
                  setControlMode("manual");
                  setManualDensity(parseInt(e.target.value));
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-2">
                <span>0 (Deserted - 20% Dim)</span>
                <span>4 (Low)</span>
                <span>8 (Medium)</span>
                <span>16+ (Peak Full Beam)</span>
              </div>
            </div>

            {/* Quick Traffic Presets Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => {
                  setControlMode("manual");
                  setManualDensity(0);
                }}
                className={`p-2 rounded-lg text-xs font-semibold transition border ${effectiveVehicleCount === 0 && controlMode === "manual"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                  }`}
              >
                🌙 Empty (0 veh)
                <div className="text-[10px] font-normal text-slate-400">20% Eco Dim</div>
              </button>

              <button
                onClick={() => {
                  setControlMode("manual");
                  setManualDensity(2);
                }}
                className={`p-2 rounded-lg text-xs font-semibold transition border ${effectiveVehicleCount === 2 && controlMode === "manual"
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                  }`}
              >
                🚗 Low (2 veh)
                <div className="text-[10px] font-normal text-slate-400">45% Medium</div>
              </button>

              <button
                onClick={() => {
                  setControlMode("manual");
                  setManualDensity(7);
                }}
                className={`p-2 rounded-lg text-xs font-semibold transition border ${effectiveVehicleCount === 7 && controlMode === "manual"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                  }`}
              >
                🚙 Steady (7 veh)
                <div className="text-[10px] font-normal text-slate-400">75% High Flow</div>
              </button>

              <button
                onClick={() => {
                  setControlMode("manual");
                  setManualDensity(16);
                }}
                className={`p-2 rounded-lg text-xs font-semibold transition border ${effectiveVehicleCount === 16 && controlMode === "manual"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                  }`}
              >
                🚛 Surge (16+ veh)
                <div className="text-[10px] font-normal text-slate-400">100% Full Beam</div>
              </button>
            </div>

            {/* Vehicle Injection & Spawner Tools */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400 font-medium">Inject Vehicles:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => spawnSpecificVehicle("car")}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1"
                >
                  <Car className="w-3 h-3 text-cyan-400" /> + Car
                </button>
                <button
                  onClick={() => spawnSpecificVehicle("truck")}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1"
                >
                  <Truck className="w-3 h-3 text-amber-400" /> + Truck
                </button>
                <button
                  onClick={() => spawnSpecificVehicle("bus")}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1"
                >
                  <Car className="w-3 h-3 text-purple-400" /> + Bus
                </button>
                <button
                  onClick={handleClearVehicles}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-xs font-semibold text-rose-300 border border-rose-800/60 transition flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Clear
                </button>
              </div>
            </div>

            {/* Environmental & Profile Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Weather conditions */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <label className="text-xs font-semibold text-slate-400 block mb-2">
                  Roadway Weather Condition:
                </label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    onClick={() => setWeather("clear")}
                    className={`py-1.5 px-2 rounded-lg font-medium transition flex items-center justify-center gap-1 ${weather === "clear"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                  >
                    <Moon className="w-3 h-3" /> Clear
                  </button>
                  <button
                    onClick={() => setWeather("rain")}
                    className={`py-1.5 px-2 rounded-lg font-medium transition flex items-center justify-center gap-1 ${weather === "rain"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                  >
                    <CloudRain className="w-3 h-3" /> Rain (+15%)
                  </button>
                  <button
                    onClick={() => setWeather("fog")}
                    className={`py-1.5 px-2 rounded-lg font-medium transition flex items-center justify-center gap-1 ${weather === "fog"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                  >
                    <CloudFog className="w-3 h-3" /> Fog (+20%)
                  </button>
                </div>
              </div>

              {/* Dimming Profile selection */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <label className="text-xs font-semibold text-slate-400 block mb-2">
                  Smart City Energy Profile:
                </label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    onClick={() => setProfile("eco")}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${profile === "eco"
                      ? "bg-emerald-500 text-slate-950 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                  >
                    Ultra Eco
                  </button>
                  <button
                    onClick={() => setProfile("balanced")}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${profile === "balanced"
                      ? "bg-cyan-500 text-slate-950 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                  >
                    Balanced
                  </button>
                  <button
                    onClick={() => setProfile("safety")}
                    className={`py-1.5 px-2 rounded-lg font-medium transition ${profile === "safety"
                      ? "bg-amber-500 text-slate-950 font-bold"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                  >
                    Safety Max
                  </button>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Individual Pole IoT Diagnostics & Telemetry Card */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Pole #{activePoleData.id} IoT Telemetry
              </h4>
              <span className="text-xs text-slate-400 font-mono">
                Click pole in canvas to inspect
              </span>
            </div>

            {/* Detailed Pole Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 relative">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-bold text-xs">
                    P{activePoleData.id}
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">{activePoleData.name}</h5>
                    <p className="text-[10px] text-slate-400 font-mono">Corridor Station @ {activePoleData.xPercent}%</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">DALI-2 ONLINE</span>
                </div>
              </div>

              {/* Diagnostics Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Luminaire Output</span>
                  <span className="text-base font-bold text-amber-300 font-mono">
                    {Math.round(activePoleData.individualBrightness)}%
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    ~{(activePoleData.individualBrightness * 140).toFixed(0)} Lumens
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Pavement Target</span>
                  <span className="text-base font-bold text-cyan-300 font-mono">
                    {activePoleData.targetLux} Lux
                  </span>
                  <span className="text-[10px] text-slate-500 block">EN 13201 Compliant</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Active Fixture Power</span>
                  <span className="text-base font-bold text-white font-mono">
                    {activePoleData.powerWatts} W
                  </span>
                  <span className="text-[10px] text-emerald-400 block">
                    Save {WATTAGE_PER_POLE - activePoleData.powerWatts}W
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">LED Junction Temp</span>
                  <span className="text-base font-bold text-emerald-300 font-mono">
                    {activePoleData.tempCelsius}°C
                  </span>
                  <span className="text-[10px] text-slate-500 block">Cool Operation</span>
                </div>
              </div>

              {/* IoT Controller Status */}
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] space-y-1">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Motion Sensor Status:</span>
                  <strong className={activePoleData.sensorTriggered ? "text-cyan-400" : "text-slate-400"}>
                    {activePoleData.sensorTriggered ? "VEHICLE DETECTED" : "IDLE MONITORING"}
                  </strong>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>DALI Dimmer Slew Rate:</span>
                  <span className="font-mono text-slate-400">18.5% / sec</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Safety Hold Delay:</span>
                  <span className="font-mono text-slate-400">{holdTimerSec.toFixed(1)}s remaining</span>
                </div>
              </div>
            </div>

            {/* Smart Streetlight Architecture Advisory */}
            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-center gap-1.5 text-indigo-300 font-semibold mb-1">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Adaptive Corridor Energy Standard
              </div>
              When traffic diminishes, conventional streetlights continue burning 100% capacity unnecessarily.
              FlowVision AI reduces baseline power draw down to 20%, automatically illuminating the roadway as vehicles enter the sensor zone.
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

