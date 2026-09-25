import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Settings as SettingsIcon,
  FolderOpen,
  LogOut,
  User,
  HardDrive,
  Tv,
  Zap,
  Clock,
  Check,
  ShieldAlert,
  FileVideo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type VideoResolution } from "@/store/useAppStore";

export function SettingsView() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const outputDirectory = useAppStore((s) => s.outputDirectory);
  const setOutputDirectory = useAppStore((s) => s.setOutputDirectory);
  const maxResolution = useAppStore((s) => s.maxResolution);
  const setMaxResolution = useAppStore((s) => s.setMaxResolution);
  const maxConcurrentDownloads = useAppStore((s) => s.maxConcurrentDownloads);
  const setMaxConcurrentDownloads = useAppStore((s) => s.setMaxConcurrentDownloads);
  const enableDownloadDelay = useAppStore((s) => s.enableDownloadDelay);
  const setEnableDownloadDelay = useAppStore((s) => s.setEnableDownloadDelay);
  const minDelaySeconds = useAppStore((s) => s.minDelaySeconds);
  const setMinDelaySeconds = useAppStore((s) => s.setMinDelaySeconds);
  const maxDelaySeconds = useAppStore((s) => s.maxDelaySeconds);
  const setMaxDelaySeconds = useAppStore((s) => s.setMaxDelaySeconds);
  const delayVideosOnly = useAppStore((s) => s.delayVideosOnly);
  const setDelayVideosOnly = useAppStore((s) => s.setDelayVideosOnly);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const resolutionOptions: {
    value: VideoResolution;
    label: string;
    sublabel: string;
    badge?: string;
  }[] = [
    { value: 360, label: "360p", sublabel: "Lowest data / Smallest file size" },
    { value: 540, label: "540p", sublabel: "Standard Quality" },
    { value: 720, label: "720p", sublabel: "High Definition (HD)", badge: "Recommended" },
    { value: 1080, label: "1080p", sublabel: "Full HD (Highest available)" },
  ];

  const concurrencyOptions = [1, 2, 3, 4, 6, 8, 10];

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Default Download Directory",
      });
      if (selected && typeof selected === "string") {
        await invoke("set_output_directory", { path: selected });
        setOutputDirectory(selected);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllUserData = useAppStore((s) => s.clearAllUserData);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await invoke("logout");
      clearAllUserData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Settings & Preferences
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your download speed, delays, resolution limits, storage path, and Coursera session.
        </p>
      </div>

      {/* Download Preferences Card */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Tv className="h-4 w-4 text-primary" />
            Maximum Video Resolution
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Sets the maximum resolution limit for all video lectures. The downloader will pick the highest available resolution up to this limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {resolutionOptions.map((opt) => {
              const isSelected = maxResolution === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMaxResolution(opt.value)}
                  className={`flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs"
                      : "border-border/50 bg-secondary/20 hover:border-border hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-sm text-foreground flex items-center gap-2">
                      {opt.label}
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    {opt.badge && (
                      <Badge variant="outline" className="text-[10px] bg-primary/15 text-primary border-primary/30 py-0">
                        {opt.badge}
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{opt.sublabel}</span>
                </button>
              );
            })}
          </div>

          {/* Download Delay & Anti-Rate-Limit Section */}
          <div className="pt-4 border-t border-border/30 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Random Delay Between Downloads
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Wait a randomized number of seconds between each file download to mimic human browsing and prevent IP rate-limiting.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={enableDownloadDelay}
                  onChange={(e) => setEnableDownloadDelay(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {enableDownloadDelay && (
              <div className="p-3.5 rounded-lg bg-secondary/40 border border-border/60 space-y-3 animate-in fade-in-50 duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      Min Delay (Seconds)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      value={minDelaySeconds}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setMinDelaySeconds(val);
                        if (val > maxDelaySeconds) {
                          setMaxDelaySeconds(val);
                        }
                      }}
                      className="h-8 bg-background font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-foreground">
                      Max Delay (Seconds)
                    </label>
                    <Input
                      type="number"
                      min={minDelaySeconds}
                      max={300}
                      value={maxDelaySeconds}
                      onChange={(e) => {
                        const val = Math.max(minDelaySeconds, parseInt(e.target.value) || minDelaySeconds);
                        setMaxDelaySeconds(val);
                      }}
                      className="h-8 bg-background font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
                  <div>
                    <label
                      htmlFor="delay-videos-only"
                      className="text-[11px] font-semibold text-foreground cursor-pointer flex items-center gap-1.5"
                    >
                      <FileVideo className="h-3.5 w-3.5 text-blue-400" />
                      Apply Delay to Videos Only (.mp4)
                    </label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Skip delays for readings and subtitles, only pausing before video lectures.
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      id="delay-videos-only"
                      type="checkbox"
                      checked={delayVideosOnly}
                      onChange={(e) => setDelayVideosOnly(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-amber-400/90 pt-1">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Concurrent downloads are locked to <strong>1 worker</strong> to ensure strict sequential delays between files.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Max Concurrent Downloads */}
          <div className="pt-4 border-t border-border/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className={`h-3.5 w-3.5 ${enableDownloadDelay ? "text-muted-foreground" : "text-amber-400"}`} />
                  Max Concurrent Downloads
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Number of parallel files downloaded simultaneously.
                </p>
              </div>
              <Badge
                variant={enableDownloadDelay ? "secondary" : "default"}
                className="font-mono text-xs px-2 py-0.5"
              >
                {enableDownloadDelay ? "1 Worker (Delay Active)" : `${maxConcurrentDownloads} Workers`}
              </Badge>
            </div>

            <div className={`flex flex-wrap items-center gap-1.5 pt-1 ${enableDownloadDelay ? "opacity-40 pointer-events-none" : ""}`}>
              {concurrencyOptions.map((num) => (
                <button
                  key={num}
                  type="button"
                  disabled={enableDownloadDelay}
                  onClick={() => setMaxConcurrentDownloads(num)}
                  className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer ${
                    (enableDownloadDelay ? 1 : maxConcurrentDownloads) === num
                      ? "bg-primary text-primary-foreground font-bold shadow-xs"
                      : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Download Destination Card */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            Storage & Download Directory
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Destination folder where course modules, videos, subtitles, and readings are saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Input value={outputDirectory} readOnly className="bg-background/60 font-mono text-xs" />
            <Button onClick={handleSelectFolder} variant="outline" size="sm" className="gap-1.5 h-10 px-3">
              <FolderOpen className="h-4 w-4 text-primary" />
              Browse
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Profile Card */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Authenticated User
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Current Coursera authentication session state
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-lg border border-border/40 bg-secondary/30">
            <div className="flex items-center gap-3">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user?.name || "User Avatar"}
                  className="h-10 w-10 rounded-full object-cover border border-border/50 shadow-sm"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                  {user?.name
                    ? user.name
                        .split(" ")
                        .filter(Boolean)
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "U"}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{user?.name || "Coursera Learner"}</p>
                <p className="text-xs text-muted-foreground">{user?.email || (user?.user_id ? `User ID: ${user.user_id}` : "Authenticated")}</p>
              </div>
            </div>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out & Clear Cookies
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
