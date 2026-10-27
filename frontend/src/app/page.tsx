"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Car,
  Truck,
  Activity,
  Cpu,
  Download,
  Maximize2,
  X,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Eye,
  SlidersHorizontal,
  FileText,
  Share2,
  ShieldCheck,
  TrendingUp,
  Radio,
  Layers,
  ArrowRight,
  Info,
  Check,
  Play,
  Pause,
  Film,
  Video,
  Volume2,
  VolumeX,
  Gauge,
  Clock,
  BarChart3,
  Image as ImageIcon,
  Lightbulb,
  Zap,
  Leaf,
} from "lucide-react";
import StreetlightSimulation from "@/components/StreetlightSimulation";

// Helper function to format vehicle class names cleanly
function formatClassName(rawName: string): { name: string; category: string; color: string } {
  const lower = rawName.toLowerCase().trim();
  if (lower === "car") {
    return { name: "Passenger Car", category: "Light Commuter", color: "emerald" };
  }
  if (lower === "truck-s-" || lower === "small truck") {
    return { name: "Light Delivery Truck", category: "Light Commercial", color: "cyan" };
  }
  if (lower === "truck-m-" || lower === "mid truck") {
    return { name: "Medium Freight Truck", category: "Medium Cargo", color: "amber" };
  }
  if (lower === "truck-l-" || lower === "big truck") {
    return { name: "Heavy Transport Hauler", category: "Heavy Freight", color: "orange" };
  }
  if (lower === "truck-xl-") {
    return { name: "Multi-Axle Semi Truck", category: "Heavy Freight", color: "rose" };
  }
  if (lower === "bus" || lower === "bus-l-") {
    return { name: "Transit Bus", category: "Public Transit", color: "purple" };
  }
  if (lower === "motorcycle" || lower === "bike") {
    return { name: "Motorbike / Two-Wheeler", category: "Light Commuter", color: "teal" };
  }
  return { name: rawName.replace(/[-_]/g, " ").toUpperCase(), category: "Commercial", color: "sky" };
}

// Preset sample media for quick 1-click evaluation
interface PresetSample {
  id: string;
  type: "image" | "video";
  title: string;
  subtitle: string;
  url: string;
  poster?: string;
  tags: string[];
  estimatedVehicles: number;
}

const PRESET_SAMPLES: PresetSample[] = [
  {
    id: "sample-video-1",
    type: "video",
    title: "Expressway Traffic Stream",
    subtitle: "Real-time ByteTrack multi-vehicle corridor sequence",
    url: "/samples/sample-traffic.mp4",
    poster: "/samples/sample-1.jpg",
    tags: ["Video Stream", "ByteTrack", "5s 24fps", "Tracking"],
    estimatedVehicles: 34,
  },
  {
    id: "sample-1",
    type: "image",
    title: "Multi-Lane Expressway",
    subtitle: "High density commercial freight & passenger corridor",
    url: "/samples/sample-1.jpg",
    tags: ["Snapshot", "Highway", "14 Vehicles"],
    estimatedVehicles: 14,
  },
  {
    id: "sample-2",
    type: "image",
    title: "Urban Expressway",
    subtitle: "Fast passenger transit & medium delivery freight",
    url: "/samples/sample-2.jpg",
    tags: ["Snapshot", "Expressway", "13 Vehicles"],
    estimatedVehicles: 13,
  },
  {
    id: "sample-3",
    type: "image",
    title: "Downtown Avenue",
    subtitle: "Commuter passenger stream with clear traffic lanes",
    url: "/samples/sample-3.jpg",
    tags: ["Snapshot", "Avenue", "7 Vehicles"],
    estimatedVehicles: 7,
  },
];

interface VideoSummary {
  totalUniqueVehicles: number;
  peakActiveVehicles: number;
  peakTimestampSec: number;
  averageActiveVehicles: number;
  totalFrames: number;
  processedFrames: number;
  durationSec: number;
  fps: number;
  estimatedFlowRatePerMin: number;
}

interface TimelinePoint {
  timeSec: number;
  frameIndex: number;
  activeCount: number;
  classes: Record<string, number>;
}

interface AnalysisResult {
  mediaType: "image" | "video";
  jobId?: string;
  image?: string;
  video?: string;
  originalVideo?: string;
  counts: Record<string, number>;
  summary?: VideoSummary;
  timeline?: TimelinePoint[];
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("Initializing inference...");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Filter presets by media type
  const [presetFilter, setPresetFilter] = useState<"all" | "video" | "image">("all");

  // Navigation module: "vision" (default traffic detection) or "streetlight" (simulation digital twin)
  const [mainView, setMainView] = useState<"vision" | "streetlight">("vision");

  // Viewer modes
  const [activeTab, setActiveTab] = useState<"annotated" | "original" | "split" | "dual">("annotated");
  const [splitPosition, setSplitPosition] = useState<number>(50);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Video Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [hoveredTimelinePoint, setHoveredTimelinePoint] = useState<TimelinePoint | null>(null);

  const splitSliderRef = useRef<HTMLDivElement>(null);
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);

  // Check backend health on mount
  useEffect(() => {
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const checkBackendHealth = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/health", { method: "GET" });
      if (res.ok) {
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch {
      setBackendOnline(false);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    const isVid = selectedFile.type.startsWith("video/") ||
      ['.mp4', '.mov', '.avi', '.webm', '.mkv'].some(ext => selectedFile.name.toLowerCase().endsWith(ext));

    setFile(selectedFile);
    setMediaType(isVid ? "video" : "image");
    setPreview(URL.createObjectURL(selectedFile));
    setResult(null);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveTab("annotated");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      const isImg = dropped.type.startsWith("image/");
      const isVid = dropped.type.startsWith("video/") ||
        ['.mp4', '.mov', '.avi', '.webm', '.mkv'].some(ext => dropped.name.toLowerCase().endsWith(ext));

      if (isImg || isVid) {
        handleFileSelection(dropped);
      } else {
        setError("Please drop a valid image (.jpg, .png) or video (.mp4, .webm, .mov) file.");
      }
    }
  };

  // Preset selector
  const handleSelectPreset = async (preset: PresetSample) => {
    setError(null);
    try {
      const res = await fetch(preset.url);
      const blob = await res.blob();
      const ext = preset.type === "video" ? "mp4" : "jpg";
      const mime = preset.type === "video" ? "video/mp4" : "image/jpeg";
      const sampleFile = new File([blob], `${preset.id}.${ext}`, { type: mime });
      handleFileSelection(sampleFile);
    } catch {
      setError(`Failed to load preset sample ${preset.title}.`);
    }
  };

  // Analyze media action (Image or Video) with live upload progress
  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setLoadingProgress(5);

    const isVid = mediaType === "video";
    const fileSizeMB = Math.round(file.size / (1024 * 1024));
    const jobId = `job-${Date.now()}`;

    setLoadingStep(
      isVid
        ? `Uploading video stream (${fileSizeMB} MB) to vision server...`
        : "Uploading image frame to vision server..."
    );

    const formData = new FormData();
    formData.append("file", file);
    formData.append("jobId", jobId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "http://localhost:3001/api/analyze");

    let progressPollInterval: NodeJS.Timeout | null = null;

    const stopProgressPolling = () => {
      if (progressPollInterval) {
        clearInterval(progressPollInterval);
        progressPollInterval = null;
      }
    };

    // Live upload progress tracking
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const loadedMB = Math.round(event.loaded / (1024 * 1024));
        const totalMB = Math.round(event.total / (1024 * 1024));
        // Upload phase maps to 5% - 50%
        setLoadingProgress(Math.min(50, Math.max(5, Math.round(percent * 0.5))));
        if (event.loaded < event.total) {
          setLoadingStep(`Uploading ${loadedMB} MB / ${totalMB} MB (${percent}%)...`);
        } else {
          setLoadingStep("Upload complete! Vision server initializing neural engine...");
        }
      }
    };

    // Fired the moment all upload bytes reach the server
    xhr.upload.onload = () => {
      setLoadingProgress(55);
      setLoadingStep(
        isVid
          ? "Upload complete! Vision server analyzing video frames with YOLOv8 & ByteTrack..."
          : "Processing neural tensors with YOLOv8..."
      );

      // Start live progress polling from server
      if (isVid) {
        progressPollInterval = setInterval(async () => {
          try {
            const progRes = await fetch(`http://localhost:3001/api/progress/${jobId}`);
            if (progRes.ok) {
              const progData = await progRes.json();
              if (progData && typeof progData.percent === "number") {
                // Map 0-100% of python work to 55%-95% of overall UI progress
                const overall = Math.min(95, 55 + Math.round((progData.percent / 100) * 40));
                setLoadingProgress(overall);
                if (progData.status) {
                  setLoadingStep(progData.status);
                } else if (progData.framesDone && progData.totalFrames) {
                  setLoadingStep(`Tracking vehicles: Frame ${progData.framesDone} / ${progData.totalFrames} (${progData.percent}%)...`);
                }
              }
            }
          } catch {
            // Ignore polling errors
          }
        }, 800);
      }
    };

    xhr.onload = () => {
      stopProgressPolling();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data: AnalysisResult = JSON.parse(xhr.responseText);
          setLoadingProgress(100);
          setLoadingStep("Analysis complete!");
          setResult(data);
          setActiveTab("annotated");
          setBackendOnline(true);
        } catch {
          setError("Failed to parse analysis response from vision server.");
        }
      } else {
        let errMessage = "Failed to analyze media with vision engine.";
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) errMessage = errData.error;
        } catch {
          errMessage = xhr.responseText || errMessage;
        }
        setError(errMessage);
      }
      setLoading(false);
    };

    xhr.onerror = () => {
      stopProgressPolling();
      setError("Could not connect to backend server on port 3001. Ensure Express & Python are running.");
      setLoading(false);
    };

    xhr.onabort = () => {
      stopProgressPolling();
      setError("Analysis request was aborted.");
      setLoading(false);
    };

    xhr.send(formData);
  };

  // Instant demo simulation (in case backend is disconnected)
  const handleRunDemoSimulation = () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(30);
    setLoadingStep(`Running simulated neural evaluation (${mediaType.toUpperCase()})...`);

    setTimeout(() => {
      setLoadingProgress(80);
      setLoadingStep("Finalizing demo telemetry...");
    }, 800);

    setTimeout(() => {
      if (mediaType === "video") {
        setResult({
          mediaType: "video",
          video: preview || "/samples/sample-traffic.mp4",
          originalVideo: preview || "/samples/sample-traffic.mp4",
          counts: {
            car: 18,
            "truck-m-": 6,
            "truck-l-": 4,
            "truck-xl-": 2,
            bus: 2,
            "truck-s-": 2,
          },
          summary: {
            totalUniqueVehicles: 34,
            peakActiveVehicles: 14,
            peakTimestampSec: 1.5,
            averageActiveVehicles: 12.1,
            totalFrames: 120,
            processedFrames: 120,
            durationSec: 5.0,
            fps: 24.0,
            estimatedFlowRatePerMin: 408.0,
          },
          timeline: [
            { timeSec: 0.0, frameIndex: 0, activeCount: 13, classes: { car: 6, "truck-m-": 4, bus: 1, "truck-l-": 2 } },
            { timeSec: 1.0, frameIndex: 24, activeCount: 12, classes: { car: 5, "truck-m-": 3, "truck-l-": 2, "truck-xl-": 2 } },
            { timeSec: 1.5, frameIndex: 36, activeCount: 14, classes: { car: 7, "truck-m-": 3, "truck-l-": 2, bus: 2 } },
            { timeSec: 2.5, frameIndex: 60, activeCount: 13, classes: { car: 6, "truck-m-": 4, "truck-xl-": 2, "truck-s-": 1 } },
            { timeSec: 3.5, frameIndex: 84, activeCount: 11, classes: { car: 5, "truck-m-": 3, "truck-l-": 2, bus: 1 } },
            { timeSec: 4.5, frameIndex: 108, activeCount: 10, classes: { car: 5, "truck-m-": 3, "truck-l-": 2 } },
          ],
        });
      } else {
        setResult({
          mediaType: "image",
          image: preview || "/samples/sample-1.jpg",
          counts: {
            car: 8,
            "truck-m-": 2,
            "truck-s-": 1,
            "truck-l-": 1,
            "big truck": 1,
            "small truck": 1,
          },
        });
      }
      setLoading(false);
      setLoadingProgress(100);
      setActiveTab("annotated");
    }, 1400);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Interactive split slider drag (for images)
  const handleSplitMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTab !== "split" || !splitSliderRef.current) return;
    const rect = splitSliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = Math.round((x / rect.width) * 100);
    setSplitPosition(percentage);
  };

  // Synchronized Video Player Controls
  const togglePlayPause = () => {
    if (primaryVideoRef.current) {
      if (isPlaying) {
        primaryVideoRef.current.pause();
        secondaryVideoRef.current?.pause();
        setIsPlaying(false);
      } else {
        primaryVideoRef.current.play();
        secondaryVideoRef.current?.play();
        setIsPlaying(true);
      }
    }
  };

  const handleVideoTimeUpdate = () => {
    if (primaryVideoRef.current) {
      const time = primaryVideoRef.current.currentTime;
      setCurrentTime(time);
      if (secondaryVideoRef.current && Math.abs(secondaryVideoRef.current.currentTime - time) > 0.15) {
        secondaryVideoRef.current.currentTime = time;
      }
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (primaryVideoRef.current) {
      setVideoDuration(primaryVideoRef.current.duration || 0);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (primaryVideoRef.current) {
      primaryVideoRef.current.currentTime = time;
    }
    if (secondaryVideoRef.current) {
      secondaryVideoRef.current.currentTime = time;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (primaryVideoRef.current) primaryVideoRef.current.playbackRate = speed;
    if (secondaryVideoRef.current) secondaryVideoRef.current.playbackRate = speed;
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (primaryVideoRef.current) primaryVideoRef.current.muted = nextMute;
    if (secondaryVideoRef.current) secondaryVideoRef.current.muted = nextMute;
  };

  // Export results as JSON
  const handleExportJSON = () => {
    if (!result) return;
    const exportData = {
      timestamp: new Date().toISOString(),
      mediaType: result.mediaType,
      totalVehicles: totalVehiclesCount,
      densityLevel: densityStatus.label,
      heavyRatio: heavyRatioPercent + "%",
      adaptiveStreetlighting: {
        currentDimLevelPercent: streetlightQuickMetrics.brightness,
        dimmingStatus: streetlightQuickMetrics.mode,
        activePowerWatts: streetlightQuickMetrics.currentWatts,
        baselineUnmanagedWatts: streetlightQuickMetrics.baselineWatts,
        powerReductionPercent: streetlightQuickMetrics.powerSavedPct + "%",
      },
      counts: result.counts,
      summary: result.summary,
      timeline: result.timeline,
    };

    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `traffic-telemetry-${result.mediaType}-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export results as CSV
  const handleExportCSV = () => {
    if (!result) return;
    let csv = "Section,Metric,Value\n";
    csv += `"Metadata","Media Type","${result.mediaType}"\n`;
    csv += `"Metadata","Total Unique / Active Vehicles",${totalVehiclesCount}\n`;
    csv += `"Metadata","Congestion Density","${densityStatus.label}"\n`;
    csv += `"Metadata","Heavy Transport Ratio","${heavyRatioPercent}%"\n`;

    if (result.summary) {
      csv += `"Summary","Peak Active Vehicles",${result.summary.peakActiveVehicles}\n`;
      csv += `"Summary","Peak Timestamp (s)",${result.summary.peakTimestampSec}\n`;
      csv += `"Summary","Average Active Vehicles",${result.summary.averageActiveVehicles}\n`;
      csv += `"Summary","Estimated Flow Rate (veh/min)",${result.summary.estimatedFlowRatePerMin}\n`;
      csv += `"Summary","Total Frames Processed",${result.summary.processedFrames}\n`;
      csv += `"Summary","Duration (s)",${result.summary.durationSec}\n`;
    }

    csv += `"Smart Streetlight","Brightness Level","${streetlightQuickMetrics.brightness}%"\n`;
    csv += `"Smart Streetlight","Dimming Mode","${streetlightQuickMetrics.mode}"\n`;
    csv += `"Smart Streetlight","Active Power (Watts)",${streetlightQuickMetrics.currentWatts}\n`;
    csv += `"Smart Streetlight","Power Conserved (%)","${streetlightQuickMetrics.powerSavedPct}%"\n`;

    csv += "\nVehicle Class,Count,Category\n";
    Object.entries(result.counts).forEach(([cls, count]) => {
      const meta = formatClassName(cls);
      csv += `"${meta.name}",${count},"${meta.category}"\n`;
    });

    if (result.timeline && result.timeline.length > 0) {
      csv += "\nTimeline (sec),Active Vehicles In Frame\n";
      result.timeline.forEach((pt) => {
        csv += `${pt.timeSec},${pt.activeCount}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `traffic-telemetry-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Copy telemetry summary to clipboard
  const handleCopySummary = () => {
    if (!result) return;
    const summaryLines = [
      `FlowVision AI Traffic Telemetry Report [${result.mediaType.toUpperCase()}]`,
      `Total Vehicles: ${totalVehiclesCount} ${result.summary ? "(Unique Tracked)" : "(In Frame)"}`,
      `Congestion Density: ${densityStatus.label} (${densityStatus.score}%)`,
      `Heavy Transport Ratio: ${heavyRatioPercent}%`,
    ];

    if (result.summary) {
      summaryLines.push(
        `Peak Congestion: ${result.summary.peakActiveVehicles} veh at ${result.summary.peakTimestampSec}s`,
        `Estimated Flow Rate: ${result.summary.estimatedFlowRatePerMin} veh/min`,
        `Stream Duration: ${result.summary.durationSec}s (${result.summary.totalFrames} frames)`
      );
    }

    summaryLines.push(
      `Smart Streetlight Dim Level: ${streetlightQuickMetrics.brightness}% [${streetlightQuickMetrics.mode}]`,
      `Grid Power Reduction: ${streetlightQuickMetrics.powerSavedPct}% (${streetlightQuickMetrics.instantWattsSaved}W saved vs 900W baseline)`
    );

    summaryLines.push("Vehicle Class Breakdown:");
    Object.entries(result.counts).forEach(([cls, cnt]) => {
      summaryLines.push(` - ${formatClassName(cls).name}: ${cnt}`);
    });

    navigator.clipboard.writeText(summaryLines.join("\n"));
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  // Derived Analytics Metrics
  const isVideoResult = result?.mediaType === "video";

  const totalVehiclesCount = result
    ? result.summary?.totalUniqueVehicles ??
    Object.values(result.counts).reduce((acc, curr) => acc + (Number(curr) || 0), 0)
    : 0;

  // Current active vehicles synchronized with video playback position or image detections
  const currentActiveVehicleCount = React.useMemo(() => {
    if (result?.mediaType === "video" && result.timeline && result.timeline.length > 0) {
      let closest = result.timeline[0];
      let minDiff = Math.abs(currentTime - closest.timeSec);
      for (const pt of result.timeline) {
        const diff = Math.abs(currentTime - pt.timeSec);
        if (diff < minDiff) {
          minDiff = diff;
          closest = pt;
        }
      }
      return closest.activeCount;
    }
    return totalVehiclesCount;
  }, [result, currentTime, totalVehiclesCount]);

  // Derived Streetlight Dimming Telemetry for Quick HUD Widget
  const streetlightQuickMetrics = React.useMemo(() => {
    const count = currentActiveVehicleCount;
    let brightness = 20;
    let mode = "DIM ECO";
    let color = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";

    if (count === 0) {
      brightness = 20;
      mode = "DIM ECO (SECURITY GLOW)";
      color = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    } else if (count <= 2) {
      brightness = 45;
      mode = "LOW DENSITY COMMUTER";
      color = "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
    } else if (count <= 6) {
      brightness = 75;
      mode = "MODERATE CORRIDOR FLOW";
      color = "text-amber-400 bg-amber-500/10 border-amber-500/20";
    } else {
      brightness = 100;
      mode = "HIGH BEAM (PEAK TRAFFIC)";
      color = "text-rose-400 bg-rose-500/10 border-rose-500/20";
    }

    const baselineWatts = 900; // 6 poles x 150W
    const currentWatts = Math.round(baselineWatts * (brightness / 100));
    const powerSavedPct = Math.round(((baselineWatts - currentWatts) / baselineWatts) * 100);

    return {
      brightness,
      mode,
      color,
      currentWatts,
      baselineWatts,
      powerSavedPct,
      instantWattsSaved: baselineWatts - currentWatts,
    };
  }, [currentActiveVehicleCount]);

  // Heavy transport calculation (trucks & buses)
  const heavyVehiclesCount = result
    ? Object.entries(result.counts).reduce((acc, [cls, count]) => {
      const lower = cls.toLowerCase();
      if (lower.includes("truck") || lower.includes("bus")) {
        return acc + count;
      }
      return acc;
    }, 0)
    : 0;

  const heavyRatioPercent =
    totalVehiclesCount > 0 ? Math.round((heavyVehiclesCount / totalVehiclesCount) * 100) : 0;

  // Dominant category
  const sortedClasses = result
    ? Object.entries(result.counts).sort((a, b) => b[1] - a[1])
    : [];
  const dominantClass = sortedClasses.length > 0 ? formatClassName(sortedClasses[0][0]) : null;
  const dominantCount = sortedClasses.length > 0 ? sortedClasses[0][1] : 0;
  const dominantPercent =
    totalVehiclesCount > 0 ? Math.round((dominantCount / totalVehiclesCount) * 100) : 0;

  // Congestion Level Indicator (calibrated for peak vs static)
  const getDensityStatus = (count: number) => {
    const threshold = isVideoResult ? result?.summary?.peakActiveVehicles || count : count;
    if (threshold === 0) {
      return {
        label: "Clear / Zero Traffic",
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        score: 5,
        advisory: "No detected vehicles. Roadway capacity is completely unobstructed.",
      };
    }
    if (threshold <= 6) {
      return {
        label: "Fluid Flow",
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
        score: 25,
        advisory: "Unimpeded transit flow. Vehicle headway is optimal with high average velocity.",
      };
    }
    if (threshold <= 14) {
      return {
        label: "Moderate Flow",
        color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
        score: 55,
        advisory: "Steady corridor traffic. Moderate lane saturation observed without queuing delays.",
      };
    }
    if (threshold <= 22) {
      return {
        label: "Dense Congestion",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
        score: 82,
        advisory: "High vehicular concentration. Approaching capacity limits; caution advised at merge junctions.",
      };
    }
    return {
      label: "Critical Saturation",
      color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      score: 95,
      advisory: "Severe traffic congestion. Road capacity exceeded; bottleneck queuing delays observed.",
    };
  };

  const densityStatus = getDensityStatus(totalVehiclesCount);

  // Filtered preset list
  const filteredPresets = PRESET_SAMPLES.filter((s) => {
    if (presetFilter === "video") return s.type === "video";
    if (presetFilter === "image") return s.type === "image";
    return true;
  });

  return (
    <div className="relative min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-[128px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-[128px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b08_1px,transparent_1px),linear-gradient(to_bottom,#1e293b08_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Navigation & Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between pb-6 mb-6 border-b border-slate-800/80 gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
              <Activity className="w-6 h-6 text-white" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#070b14] animate-ping" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#070b14]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  FlowVision <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">AI</span>
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-full">
                  v2.5 Video & Neural Stream
                </span>
              </div>
              <p className="text-xs text-slate-400">Aerial CCTV & Video Traffic Telemetry Intelligence</p>
            </div>
          </div>

          {/* Engine Telemetry Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
              <span className="relative flex h-2 w-2">
                {backendOnline === true ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </>
                ) : backendOnline === false ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
                )}
              </span>
              <span className="text-slate-300">
                {backendOnline === true
                  ? "AI Engine Online (YOLOv8 + ByteTrack)"
                  : backendOnline === false
                    ? "Backend Offline (Port 3001)"
                    : "Checking Engine..."}
              </span>
            </div>

            {(file || result) && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
                title="Reset Workspace"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </header>

        {/* Main Application Module Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 pb-3 border-b border-slate-800/80 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMainView("vision")}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                mainView === "vision"
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent"
              }`}
            >
              <Film className="w-4 h-4 text-cyan-400" />
              <span>Traffic Vision Telemetry</span>
            </button>

            <button
              onClick={() => setMainView("streetlight")}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                mainView === "streetlight"
                  ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent"
              }`}
            >
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span>Smart Streetlight Simulation</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400/20 text-amber-300 border border-amber-400/30">
                {Math.round(streetlightQuickMetrics.brightness)}% Dim
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              {streetlightQuickMetrics.powerSavedPct}% Power Conserved
            </span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="text-slate-400 hidden sm:inline">
              Active Flow: <strong className="text-white">{currentActiveVehicleCount} veh</strong>
            </span>
          </div>
        </div>

        {mainView === "streetlight" ? (
          <section className="mb-12 animate-in fade-in duration-300 space-y-6">
            <StreetlightSimulation
              syncedTrafficCount={currentActiveVehicleCount}
              isLiveVideo={isVideoResult}
              currentTime={currentTime}
              videoDuration={videoDuration || result?.summary?.durationSec || 0}
              timeline={result?.timeline}
              onSeek={handleSeek}
            />

            {/* If video is currently analyzed or loaded, show the synchronized player bar below */}
            {result?.mediaType === "video" && (
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Synchronized AI Video Stream Feed
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-300">
                    {currentTime.toFixed(1)}s / {(videoDuration || result.summary?.durationSec || 5).toFixed(1)}s
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-5 rounded-xl overflow-hidden aspect-video bg-black border border-slate-800 relative">
                    <video
                      ref={primaryVideoRef}
                      src={result.video}
                      className="w-full h-full object-contain"
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      playsInline
                      muted={isMuted}
                      loop
                    />
                  </div>

                  <div className="md:col-span-7 flex flex-col space-y-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlayPause}
                        className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
                      >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                        <span>{isPlaying ? "Pause Stream" : "Play Stream"}</span>
                      </button>
                      <button
                        onClick={() => handleSeek(0)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                      >
                        Restart (0s)
                      </button>
                      <button
                        onClick={() => setMainView("vision")}
                        className="ml-auto text-xs text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        Inspect AI Detections & Class Ratios <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
                        {currentTime.toFixed(1)}s
                      </span>
                      <input
                        type="range"
                        min="0"
                        max={videoDuration || result.summary?.durationSec || 5}
                        step="0.05"
                        value={currentTime}
                        onChange={(e) => handleSeek(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                      <span className="text-[11px] font-mono text-slate-400 w-10">
                        {(videoDuration || result.summary?.durationSec || 5).toFixed(1)}s
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      As the traffic video plays, ByteTrack neural detections modulate each streetlight fixture&apos;s illumination and power draw in real time.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* If no video is analyzed yet, provide a quick link to load the Expressway sample */}
            {!result && (
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>
                    Want to see streetlights sync with aerial CCTV footage? Load the pre-packaged Expressway sample!
                  </span>
                </div>
                <button
                  onClick={() => {
                    handleSelectPreset(PRESET_SAMPLES[0]);
                    setMainView("vision");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Film className="w-3.5 h-3.5" />
                  Load Sample Video
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
        {/* Hero Banner with Telemetry highlights */}
        <section className="mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-indigo-950/40 border border-slate-800/80 p-6 md:p-8 backdrop-blur-md">
            <div className="relative z-10 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Dual-Mode Support: High-FPS Video Stream Tracking & Instant Image Snapshots
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight mb-3">
                Real-Time Traffic Flow, Video Tracking & Density Telemetry
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
                Feed traffic CCTV video clips or aerial drone images. Our tuned YOLOv8 vision engine with ByteTrack
                tracks persistent vehicle IDs, computes traffic flow velocities, detects congestion surges, and plots time-series telemetry.
              </p>

              {/* Quick Spec Pills */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <Film className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pipeline: <strong>Video ByteTrack + Single-Frame</strong></span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Model: <strong>best.pt (YOLOv8)</strong></span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Telemetry: <strong>Temporal Density Timeline & Class Ratios</strong></span>
                </div>
              </div>
            </div>

            {/* Decorative background radar circle */}
            <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 w-64 h-64 border border-cyan-500/20 rounded-full opacity-40 pointer-events-none">
              <div className="absolute inset-4 border border-dashed border-indigo-500/20 rounded-full" />
              <div className="absolute inset-12 border border-slate-600/30 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400 animate-pulse" />
              </div>
            </div>
          </div>
        </section>

        {/* Upload Zone & Presets Section */}
        <section className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Main Upload Drop Area */}
            <div className="lg:col-span-7 flex flex-col">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative group flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 sm:p-8 transition-all duration-300 cursor-pointer min-h-[260px] ${isDragging
                  ? "border-cyan-400 bg-cyan-950/20 scale-[1.01]"
                  : file
                    ? "border-slate-700 bg-slate-900/60 hover:border-cyan-500/50"
                    : "border-slate-800 hover:border-cyan-500/40 bg-slate-900/40 hover:bg-slate-900/60"
                  }`}
                onClick={() => document.getElementById("file-upload-input")?.click()}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  accept="image/png, image/jpeg, image/webp, video/mp4, video/quicktime, video/webm, video/x-msvideo"
                  onChange={handleInputChange}
                  className="hidden"
                />

                {!preview ? (
                  <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-950/60 to-indigo-950/60 border border-cyan-500/30 flex items-center justify-center mb-4 text-cyan-400 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/20 transition-all">
                      <Film className="w-8 h-8" />
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        VIDEO (.mp4, .mov, .webm)
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        IMAGE (.jpg, .png, .webp)
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-white mb-1">
                      Drop traffic surveillance video or image here
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 mb-4 max-w-sm">
                      Upload highway camera sequences for real-time tracking or aerial drone frames for density classification
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      Browse Files from Computer
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex flex-col sm:flex-row items-center gap-5">
                    <div className="relative w-44 h-32 rounded-xl overflow-hidden border border-slate-700 flex-shrink-0 bg-slate-950 flex items-center justify-center">
                      {mediaType === "video" ? (
                        <video
                          src={preview}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img src={preview} alt="Input Preview" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                      <span className="absolute bottom-2 left-2 text-[10px] text-cyan-300 font-mono flex items-center gap-1.5">
                        {mediaType === "video" ? <Video className="w-3 h-3 text-cyan-400" /> : <ImageIcon className="w-3 h-3 text-indigo-400" />}
                        {mediaType.toUpperCase()} READY
                      </span>
                    </div>

                    <div className="flex-1 text-center sm:text-left">
                      <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-sm font-semibold text-white truncate max-w-xs">
                          {file ? file.name : "Loaded Traffic Stream"}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">
                        {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : "Preset Media"} • {mediaType === "video" ? "Sequential Video Feed" : "Static Aerial Frame"}
                      </p>
                      <div className="flex items-center gap-3 justify-center sm:justify-start">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById("file-upload-input")?.click();
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium"
                        >
                          Change File
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Bar */}
              <div className="mt-4 flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={!file || loading}
                  className={`w-full sm:flex-1 py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg ${!file || loading
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                    : "bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 text-white hover:from-cyan-400 hover:to-indigo-500 shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] border border-cyan-400/40"
                    }`}
                >
                  {loading ? (
                    <div className="flex items-center gap-3 w-full justify-center">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
                      <div className="flex flex-col text-left">
                        <span className="text-xs text-cyan-200">{loadingStep}</span>
                        <div className="w-48 sm:w-64 h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                            style={{ width: `${loadingProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {mediaType === "video" ? <Film className="w-4 h-4 text-cyan-200" /> : <Cpu className="w-4 h-4 text-cyan-200" />}
                      <span>
                        {mediaType === "video"
                          ? "Run ByteTrack Video Telemetry Analysis"
                          : "Run YOLOv8 Static Frame Analysis"}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* If backend is offline, give users a Demo Simulation option */}
                {!backendOnline && file && !loading && (
                  <button
                    onClick={handleRunDemoSimulation}
                    className="w-full sm:w-auto py-3.5 px-4 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 transition flex items-center justify-center gap-1.5"
                    title="Run with sample neural output if backend is not started"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Instant Demo Preview
                  </button>
                )}
              </div>

              {/* Error Notice */}
              {error && (
                <div className="mt-4 p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start gap-3 text-rose-200 text-xs sm:text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-rose-300 mb-1">Inference Service Alert</p>
                    <p className="text-rose-200/90">{error}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        onClick={checkBackendHealth}
                        className="text-xs font-medium text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Retry Connection
                      </button>
                      <button
                        onClick={handleRunDemoSimulation}
                        className="text-xs font-medium text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" /> Load Sample Output Instead
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Presets Shelf Column */}
            <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-slate-900/40 border border-slate-800/80 p-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Instant Evaluation Presets
                  </h3>
                  <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                    <button
                      onClick={() => setPresetFilter("all")}
                      className={`px-2 py-0.5 rounded ${presetFilter === "all" ? "bg-cyan-500 text-white font-semibold" : "text-slate-400"}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setPresetFilter("video")}
                      className={`px-2 py-0.5 rounded ${presetFilter === "video" ? "bg-cyan-500 text-white font-semibold" : "text-slate-400"}`}
                    >
                      Video
                    </button>
                    <button
                      onClick={() => setPresetFilter("image")}
                      className={`px-2 py-0.5 rounded ${presetFilter === "image" ? "bg-cyan-500 text-white font-semibold" : "text-slate-400"}`}
                    >
                      Images
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Click a pre-packaged sample to immediately inspect video tracking or aerial image detection:
                </p>

                <div className="space-y-2.5">
                  {filteredPresets.map((sample) => (
                    <div
                      key={sample.id}
                      onClick={() => handleSelectPreset(sample)}
                      className="group flex items-center gap-3.5 p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition-all duration-200"
                    >
                      <div className="w-16 h-12 rounded-lg overflow-hidden bg-slate-950 flex-shrink-0 border border-slate-800 relative flex items-center justify-center">
                        {sample.type === "video" ? (
                          <>
                            <img
                              src={sample.poster || "/samples/sample-1.jpg"}
                              alt={sample.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition duration-300 opacity-80"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Play className="w-4 h-4 text-cyan-300 fill-cyan-400/30" />
                            </div>
                          </>
                        ) : (
                          <img
                            src={sample.url}
                            alt={sample.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 truncate transition flex items-center gap-1.5">
                            {sample.title}
                            {sample.type === "video" && (
                              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono border border-cyan-500/30">
                                VIDEO
                              </span>
                            )}
                          </h4>
                          <span className="text-[10px] font-mono text-cyan-400/80 flex-shrink-0">
                            ~{sample.estimatedVehicles} veh
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mb-1">
                          {sample.subtitle}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sample.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[9px] border border-slate-700/60"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Calibrated for Urban Corridors
                </span>
                <span className="font-mono text-slate-500">YOLOv8 + ByteTrack</span>
              </div>
            </div>

          </div>
        </section>

        {/* Results Analytics & Visualizer Section */}
        {result && (
          <section className="mb-12 space-y-6 animate-in fade-in duration-500">

            {/* Visualizer & Metric Dashboard Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

              {/* Left Column: Visual Telemetry Canvas */}
              <div className="lg:col-span-7 flex flex-col rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-2xl backdrop-blur-md">

                {/* Viewport Header Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setActiveTab("annotated")}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${activeTab === "annotated"
                        ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                        : "text-slate-400 hover:text-white"
                        }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {result.mediaType === "video" ? "AI Tracking Stream" : "YOLO Detections"}
                    </button>

                    {preview && (
                      <>
                        <button
                          onClick={() => setActiveTab("original")}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${activeTab === "original"
                            ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                            : "text-slate-400 hover:text-white"
                            }`}
                        >
                          Raw Feed
                        </button>

                        {result.mediaType === "video" ? (
                          <button
                            onClick={() => setActiveTab("dual")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${activeTab === "dual"
                              ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                              : "text-slate-400 hover:text-white"
                              }`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Dual Sync
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveTab("split")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${activeTab === "split"
                              ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/20"
                              : "text-slate-400 hover:text-white"
                              }`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Split Slider
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsZoomOpen(true)}
                      className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition"
                      title="Inspect in High-Res Modal"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <a
                      href={result.mediaType === "video" ? result.video : result.image}
                      download={`traffic-${result.mediaType}-annotated-${Date.now()}.${result.mediaType === "video" ? "mp4" : "jpg"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/60 transition"
                      title="Download output media"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  </div>
                </div>

                {/* Media Display Surface */}
                <div className="relative w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center min-h-[360px]">

                  {/* VIDEO MODE RENDERING */}
                  {result.mediaType === "video" && (
                    <div className="w-full flex flex-col">
                      {activeTab === "annotated" && (
                        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
                          <video
                            ref={primaryVideoRef}
                            src={result.video}
                            className="w-full h-full object-contain"
                            onTimeUpdate={handleVideoTimeUpdate}
                            onLoadedMetadata={handleVideoLoadedMetadata}
                            playsInline
                            muted={isMuted}
                            loop
                          />
                          <div className="absolute top-3 left-3 bg-slate-950/80 border border-cyan-500/40 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-cyan-300 flex items-center gap-2 pointer-events-none">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            ByteTrack Active • {result.summary?.totalUniqueVehicles || totalVehiclesCount} Total Unique
                          </div>
                        </div>
                      )}

                      {activeTab === "original" && (
                        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
                          <video
                            ref={primaryVideoRef}
                            src={result.originalVideo || preview || result.video}
                            className="w-full h-full object-contain"
                            onTimeUpdate={handleVideoTimeUpdate}
                            onLoadedMetadata={handleVideoLoadedMetadata}
                            playsInline
                            muted={isMuted}
                            loop
                          />
                          <div className="absolute top-3 left-3 bg-slate-950/80 border border-slate-700/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-slate-300 pointer-events-none">
                            Raw Video Feed
                          </div>
                        </div>
                      )}

                      {activeTab === "dual" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 bg-slate-950">
                          <div className="relative rounded-lg overflow-hidden border border-slate-800 aspect-video bg-black">
                            <video
                              ref={primaryVideoRef}
                              src={result.video}
                              className="w-full h-full object-cover"
                              onTimeUpdate={handleVideoTimeUpdate}
                              onLoadedMetadata={handleVideoLoadedMetadata}
                              playsInline
                              muted={isMuted}
                              loop
                            />
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] font-mono text-cyan-300 border border-cyan-900 pointer-events-none">
                              AI Annotated Tracking
                            </div>
                          </div>

                          <div className="relative rounded-lg overflow-hidden border border-slate-800 aspect-video bg-black">
                            <video
                              ref={secondaryVideoRef}
                              src={result.originalVideo || preview || result.video}
                              className="w-full h-full object-cover"
                              playsInline
                              muted={isMuted}
                              loop
                            />
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] font-mono text-slate-300 border border-slate-800 pointer-events-none">
                              Raw Camera Feed
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Video Player Floating / Docked Controls */}
                      <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex flex-col gap-2">
                        {/* Time scrub bar */}
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
                            {currentTime.toFixed(1)}s
                          </span>
                          <input
                            type="range"
                            min="0"
                            max={videoDuration || result.summary?.durationSec || 5}
                            step="0.05"
                            value={currentTime}
                            onChange={(e) => handleSeek(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                          <span className="text-[11px] font-mono text-slate-400 w-12">
                            {(videoDuration || result.summary?.durationSec || 5).toFixed(1)}s
                          </span>
                        </div>

                        {/* Player buttons */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={togglePlayPause}
                              className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition flex items-center gap-1.5"
                            >
                              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                              <span>{isPlaying ? "Pause" : "Play"}</span>
                            </button>

                            <button
                              onClick={toggleMute}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title={isMuted ? "Unmute" : "Mute"}
                            >
                              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400">Speed:</span>
                            {[0.5, 1, 1.5, 2].map((s) => (
                              <button
                                key={s}
                                onClick={() => handleSpeedChange(s)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${playbackSpeed === s
                                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                                  : "text-slate-400 hover:text-white bg-slate-800/60"
                                  }`}
                              >
                                {s}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* IMAGE MODE RENDERING */}
                  {result.mediaType === "image" && result.image && (
                    <>
                      {/* Standard Annotated Mode */}
                      {activeTab === "annotated" && (
                        <div className="relative w-full h-auto">
                          <img
                            src={result.image}
                            alt="AI Annotated Traffic"
                            className="w-full h-auto object-contain max-h-[560px] mx-auto rounded-lg"
                          />
                          <div className="absolute top-3 left-3 bg-slate-950/80 border border-slate-700/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-cyan-300 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            AI Inferred • {totalVehiclesCount} detections
                          </div>
                        </div>
                      )}

                      {/* Original Mode */}
                      {activeTab === "original" && preview && (
                        <div className="relative w-full h-auto">
                          <img
                            src={preview}
                            alt="Original Raw Traffic Frame"
                            className="w-full h-auto object-contain max-h-[560px] mx-auto rounded-lg"
                          />
                          <div className="absolute top-3 left-3 bg-slate-950/80 border border-slate-700/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-slate-300">
                            Raw Source Frame
                          </div>
                        </div>
                      )}

                      {/* Interactive Before/After Split Mode */}
                      {activeTab === "split" && preview && (
                        <div
                          ref={splitSliderRef}
                          onMouseMove={handleSplitMouseMove}
                          className="relative w-full h-[480px] overflow-hidden select-none cursor-ew-resize"
                        >
                          <img
                            src={result.image}
                            alt="Annotated"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{ width: `${splitPosition}%` }}
                          >
                            <img
                              src={preview}
                              alt="Original"
                              className="absolute inset-0 w-full h-full object-cover max-w-none"
                              style={{
                                width: splitSliderRef.current
                                  ? `${splitSliderRef.current.clientWidth}px`
                                  : "100%",
                              }}
                            />
                          </div>

                          <div
                            className="absolute top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.8)] z-20 pointer-events-none"
                            style={{ left: `${splitPosition}%` }}
                          >
                            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-900 border-2 border-cyan-400 flex items-center justify-center text-cyan-300 shadow-xl">
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          <div className="absolute bottom-3 left-3 z-10 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
                            Original ({splitPosition}%)
                          </div>
                          <div className="absolute bottom-3 right-3 z-10 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 border border-cyan-900">
                            Annotated ({100 - splitPosition}%)
                          </div>
                        </div>
                      )}
                    </>
                  )}

                </div>

                {/* Sub-bar Information */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Engine: <strong>{result.mediaType === "video" ? "YOLOv8 + ByteTrack DeepSORT" : "YOLOv8 Bounding Boxes"}</strong></span>
                  <span>Confidence threshold: <strong>0.25+</strong></span>
                </div>

                {/* Video Temporal Density Timeline Chart */}
                {result.mediaType === "video" && result.timeline && result.timeline.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Traffic Congestion Timeline & Surge Analysis
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Click curve to seek video
                      </span>
                    </div>

                    {/* Interactive SVG Chart */}
                    <div className="relative w-full h-36 bg-slate-950/90 rounded-xl border border-slate-800/80 p-2 overflow-hidden">
                      {(() => {
                        const pts = result.timeline;
                        const maxCount = Math.max(...pts.map((p) => p.activeCount), 1);
                        const width = 600;
                        const height = 110;
                        const dur = result.summary?.durationSec || pts[pts.length - 1].timeSec || 5;

                        const coordinates = pts.map((p) => {
                          const x = (p.timeSec / dur) * width;
                          const y = height - (p.activeCount / maxCount) * (height - 20) - 10;
                          return { x, y, pt: p };
                        });

                        const pathData = coordinates.reduce(
                          (acc, c, idx) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`),
                          ""
                        );
                        const areaData = `${pathData} L ${width} ${height} L 0 ${height} Z`;

                        // Current playback marker X position
                        const currentX = (currentTime / dur) * width;

                        return (
                          <div className="relative w-full h-full flex flex-col justify-between">
                            <svg
                              viewBox={`0 0 ${width} ${height}`}
                              className="w-full h-full cursor-pointer"
                              preserveAspectRatio="none"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const seekTime = (clickX / rect.width) * dur;
                                handleSeek(Math.max(0, Math.min(seekTime, dur)));
                              }}
                            >
                              <defs>
                                <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              {/* Grid lines */}
                              <line x1="0" y1="20" x2={width} y2="20" stroke="#1e293b" strokeDasharray="4" />
                              <line x1="0" y1="60" x2={width} y2="60" stroke="#1e293b" strokeDasharray="4" />
                              <line x1="0" y1="95" x2={width} y2="95" stroke="#1e293b" strokeDasharray="4" />

                              {/* Area fill & Path */}
                              <path d={areaData} fill="url(#trafficGradient)" />
                              <path d={pathData} fill="none" stroke="#22d3ee" strokeWidth="2.5" />

                              {/* Interactive Data points */}
                              {coordinates.map((c, i) => (
                                <circle
                                  key={i}
                                  cx={c.x}
                                  cy={c.y}
                                  r="4"
                                  className="fill-slate-900 stroke-cyan-400 stroke-2 hover:r-6 hover:fill-cyan-300 transition-all cursor-pointer"
                                  onMouseEnter={() => setHoveredTimelinePoint(c.pt)}
                                  onMouseLeave={() => setHoveredTimelinePoint(null)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSeek(c.pt.timeSec);
                                  }}
                                />
                              ))}

                              {/* Active playback seeker line */}
                              <line
                                x1={currentX}
                                y1="0"
                                x2={currentX}
                                y2={height}
                                stroke="#f43f5e"
                                strokeWidth="2"
                                strokeDasharray="2"
                              />
                            </svg>

                            {/* Tooltip display */}
                            {hoveredTimelinePoint && (
                              <div className="absolute top-2 right-2 bg-slate-900/95 border border-cyan-500/40 rounded-lg p-2 text-[10px] text-slate-200 shadow-xl backdrop-blur-md pointer-events-none">
                                <div className="font-bold text-cyan-300">
                                  Time: {hoveredTimelinePoint.timeSec.toFixed(1)}s (Frame {hoveredTimelinePoint.frameIndex})
                                </div>
                                <div className="text-white font-semibold">
                                  Active Vehicles: {hoveredTimelinePoint.activeCount}
                                </div>
                                <div className="text-slate-400 mt-0.5">
                                  {Object.entries(hoveredTimelinePoint.classes)
                                    .map(([k, v]) => `${formatClassName(k).name}: ${v}`)
                                    .join(", ")}
                                </div>
                              </div>
                            )}

                            {/* X-axis labels */}
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1 pt-1">
                              <span>00:00.0</span>
                              <span>Peak: {result.summary?.peakActiveVehicles} veh ({result.summary?.peakTimestampSec}s)</span>
                              <span>{dur.toFixed(1)}s</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

              </div>

              {/* Right Column: Telemetry & Traffic Metrics Suite */}
              <div className="lg:col-span-5 flex flex-col space-y-5">

                {/* Primary KPI Cards Grid */}
                <div className="grid grid-cols-2 gap-3">

                  {/* Total Count KPI */}
                  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400">
                        {isVideoResult ? "Unique Vehicles" : "Total Count"}
                      </span>
                      {isVideoResult ? <Film className="w-4 h-4 text-cyan-400" /> : <Car className="w-4 h-4 text-cyan-400" />}
                    </div>
                    <div className="text-3xl font-extrabold text-white tracking-tight">
                      {totalVehiclesCount}
                    </div>
                    <div className="mt-1 text-[11px] text-cyan-300/80 font-medium">
                      {isVideoResult ? "Persistent Tracked IDs" : "Vehicles In Scene"}
                    </div>
                  </div>

                  {/* Congestion Index KPI */}
                  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400">
                        {isVideoResult ? "Peak Congestion" : "Flow Density"}
                      </span>
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-lg font-bold text-white truncate">
                      {densityStatus.label}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 rounded-full"
                          style={{ width: `${densityStatus.score}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {isVideoResult ? `${result.summary?.peakActiveVehicles} pk` : `${densityStatus.score}%`}
                      </span>
                    </div>
                  </div>

                  {/* Flow Rate / Speed or Dominant Class */}
                  {isVideoResult ? (
                    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 relative overflow-hidden">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-400">Flow Throughput</span>
                        <Gauge className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-2xl font-bold text-white tracking-tight">
                        {result.summary?.estimatedFlowRatePerMin || 0}
                      </div>
                      <div className="mt-1 text-[11px] text-emerald-400/80 font-medium">
                        Est. Vehicles / Minute
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 relative overflow-hidden">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-400">Dominant Class</span>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-sm font-bold text-white truncate">
                        {dominantClass ? dominantClass.name : "N/A"}
                      </div>
                      <div className="mt-1 text-[11px] text-emerald-400/80 font-medium">
                        {dominantPercent}% of total traffic
                      </div>
                    </div>
                  )}

                  {/* Freight / Heavy Transport Ratio */}
                  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-4 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400">Freight Ratio</span>
                      <Truck className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="text-2xl font-bold text-white tracking-tight">
                      {heavyRatioPercent}%
                    </div>
                    <div className="mt-1 text-[11px] text-orange-400/80 font-medium">
                      {heavyVehiclesCount} Heavy Commercials
                    </div>
                  </div>

                </div>

                {/* Adaptive Streetlight Quick Telemetry Card */}
                <div className="rounded-2xl bg-gradient-to-r from-slate-900/90 to-amber-950/20 border border-amber-500/30 p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Lightbulb className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Adaptive Streetlight Dimmer
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {isVideoResult ? "Synced to Video Stream Playback" : "Calibrated to Detected Traffic Scene"}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${streetlightQuickMetrics.color}`}>
                      {streetlightQuickMetrics.mode}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 mb-3">
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Brightness</span>
                      <span className="text-lg font-extrabold text-amber-300 font-mono">
                        {streetlightQuickMetrics.brightness}%
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Energy Saved</span>
                      <span className="text-lg font-extrabold text-emerald-400 font-mono">
                        {streetlightQuickMetrics.powerSavedPct}%
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Active Draw</span>
                      <span className="text-lg font-extrabold text-white font-mono">
                        {streetlightQuickMetrics.currentWatts}W
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Flow: <strong className="text-white">{currentActiveVehicleCount} veh</strong> ({streetlightQuickMetrics.instantWattsSaved}W conserved)
                    </span>
                    <button
                      onClick={() => setMainView("streetlight")}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 underline"
                    >
                      Open Full Simulation <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Detailed Breakdown by Class */}
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      Vehicle Class Breakdown
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      {Object.keys(result.counts).length} classes detected
                    </span>
                  </div>

                  {Object.keys(result.counts).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(result.counts).map(([cls, count]) => {
                        const meta = formatClassName(cls);
                        const pct =
                          totalVehiclesCount > 0
                            ? Math.round((Number(count) / totalVehiclesCount) * 100)
                            : 0;

                        return (
                          <div
                            key={cls}
                            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-xs text-white truncate">
                                  {meta.name}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  {meta.category}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-xs font-bold text-cyan-300 font-mono">
                                  {count}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  ({pct}%)
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      No vehicles or objects detected in frame.
                    </div>
                  )}
                </div>

                {/* AI Traffic Flow Advisory */}
                <div className="rounded-xl bg-indigo-950/25 border border-indigo-500/20 p-4">
                  <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold mb-1">
                    <Info className="w-4 h-4 text-indigo-400" />
                    Intelligent Traffic Advisory
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {densityStatus.advisory}
                  </p>
                  {isVideoResult && result.summary && (
                    <div className="mt-2.5 pt-2 border-t border-indigo-500/20 flex items-center justify-between text-[11px] text-indigo-300/80">
                      <span>Stream Length: {result.summary.durationSec}s</span>
                      <span>Frames Processed: {result.summary.processedFrames}</span>
                      <span>Avg Density: {result.summary.averageActiveVehicles} veh</span>
                    </div>
                  )}
                </div>

                {/* Export & Sharing Tools */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleExportJSON}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    Export JSON
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    Export CSV
                  </button>
                  <button
                    onClick={handleCopySummary}
                    className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 transition flex items-center justify-center gap-1.5"
                    title="Copy summary to clipboard"
                  >
                    {copiedToast ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300 text-xs">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs">Copy</span>
                      </>
                    )}
                  </button>
                </div>

              </div>

            </div>
          </section>
        )}
          </>
        )}

      </div>

      {/* High-Resolution Inspection Zoom Modal */}
      {isZoomOpen && result && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-cyan-400" />
                High-Resolution Inference Inspection ({result.mediaType.toUpperCase()})
              </h3>
              <span className="text-xs font-mono text-cyan-400/90 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/40">
                {totalVehiclesCount} {result.mediaType === "video" ? "Unique Vehicles" : "Detections"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={result.mediaType === "video" ? result.video : result.image}
                download={`traffic-${result.mediaType}-fullscreen.${result.mediaType === "video" ? "mp4" : "jpg"}`}
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                Download Original
              </a>
              <button
                onClick={() => setIsZoomOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {result.mediaType === "video" ? (
              <video
                src={result.video}
                controls
                autoPlay
                className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl border border-slate-800"
              />
            ) : (
              <img
                src={result.image}
                alt="High Resolution Traffic Analysis"
                className="max-h-[90vh] max-w-full object-contain rounded-xl shadow-2xl border border-slate-800"
              />
            )}
          </div>
        </div>
      )}

      {/* Global Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-[#050810] py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-500" />
            <span className="font-semibold text-slate-400">FlowVision AI</span>
            <span>— YOLOv8 & ByteTrack Multi-Class Traffic Telemetry</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Next.js 16</span>
            <span>•</span>
            <span>ByteTrack Deep Learning</span>
            <span>•</span>
            <span>H.264 Stream Engine</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
