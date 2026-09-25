import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Download,
  FolderOpen,
  CheckCircle2,
  Loader2,
  FileVideo,
  FileText,
  FileCode,
  RotateCcw,
  ExternalLink,
  Zap,
  RefreshCw,
  HardDrive,
  Layers,
  Search,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Play,
  Clock,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils";
import {
  useAppStore,
  type DownloadTask,
  type DownloadedItem,
  type CourseManifest,
} from "@/store/useAppStore";
import { CachedImage } from "@/components/CachedImage";

export function DownloadsView() {
  const activeManifest = useAppStore((s) => s.activeManifest);
  const setActiveManifest = useAppStore((s) => s.setActiveManifest);
  const isDownloading = useAppStore((s) => s.isDownloading);
  const setIsDownloading = useAppStore((s) => s.setIsDownloading);
  const liveTasks = useAppStore((s) => s.liveTasks);
  const outputDirectory = useAppStore((s) => s.outputDirectory);
  const setOutputDirectory = useAppStore((s) => s.setOutputDirectory);
  const resetDownloads = useAppStore((s) => s.resetDownloads);
  const maxResolution = useAppStore((s) => s.maxResolution);

  const [activeTab, setActiveTab] = useState<"library" | "queue">(
    activeManifest ? "queue" : "library"
  );
  const [downloadedItems, setDownloadedItems] = useState<DownloadedItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "course" | "spec">("all");
  const [expandedSpecs, setExpandedSpecs] = useState<Record<string, boolean>>({});
  const [preparingSlug, setPreparingSlug] = useState<string | null>(null);
  const [taskFilterType, setTaskFilterType] = useState<"all" | "downloading" | "completed" | "failed">("all");

  // Sync output directory to Rust backend on mount or when changed
  useEffect(() => {
    if (outputDirectory) {
      invoke("set_output_directory", { path: outputDirectory }).catch(console.error);
    }
  }, [outputDirectory]);

  // Load downloaded library
  const loadDownloadedLibrary = async () => {
    setIsLoadingLibrary(true);
    try {
      const items = await invoke<DownloadedItem[]>("get_all_downloaded_items");
      setDownloadedItems(items);
    } catch (err) {
      console.error("Failed to load downloaded library", err);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  useEffect(() => {
    loadDownloadedLibrary();
  }, [outputDirectory, isDownloading]);

  // Auto-switch to queue tab when a new manifest is activated
  useEffect(() => {
    if (activeManifest && isDownloading) {
      setActiveTab("queue");
    }
  }, [activeManifest, isDownloading]);

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Download Destination Folder",
      });
      if (selected && typeof selected === "string") {
        const resolved = await invoke<string>("set_output_directory", { path: selected });
        setOutputDirectory(resolved || selected);
        await loadDownloadedLibrary();
      }
    } catch (err) {
      console.error("Failed to select folder", err);
    }
  };

  const handleOpenFolder = async (customPath?: string) => {
    try {
      await invoke("open_download_folder", { path: customPath || outputDirectory });
    } catch (err) {
      console.error("Failed to open download folder", err);
    }
  };

  const handleResumeOrInspect = async (item: DownloadedItem) => {
    setPreparingSlug(item.slug);
    try {
      const manifest = await invoke<CourseManifest>("prepare_course_download", {
        slug: item.slug,
        isSpec: item.is_spec,
        prefixSep: " - ",
        maxResolution,
      });
      setActiveManifest(manifest);
      setActiveTab("queue");
    } catch (err: any) {
      alert(`Failed to inspect course: ${err}`);
    } finally {
      setPreparingSlug(null);
    }
  };

  const maxConcurrentDownloads = useAppStore((s) => s.maxConcurrentDownloads);
  const enableDownloadDelay = useAppStore((s) => s.enableDownloadDelay);
  const minDelaySeconds = useAppStore((s) => s.minDelaySeconds);
  const maxDelaySeconds = useAppStore((s) => s.maxDelaySeconds);
  const delayVideosOnly = useAppStore((s) => s.delayVideosOnly);

  const handleStartDownload = async () => {
    if (!activeManifest || isDownloading) return;
    setIsDownloading(true);
    try {
      if (outputDirectory) {
        await invoke("set_output_directory", { path: outputDirectory });
      }
      await invoke("start_download", {
        maxConcurrent: enableDownloadDelay ? 1 : maxConcurrentDownloads,
        minDelay: enableDownloadDelay ? minDelaySeconds : null,
        maxDelay: enableDownloadDelay ? maxDelaySeconds : null,
        delayVideosOnly: enableDownloadDelay ? delayVideosOnly : false,
      });
    } catch (err: any) {
      alert(`Download start error: ${typeof err === "string" ? err : err?.message || JSON.stringify(err)}`);
      setIsDownloading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (isDownloading) return;
    const tasks = useAppStore.getState().liveTasks;
    const updated = { ...tasks };
    Object.keys(updated).forEach((id) => {
      if (updated[id].status === "failed") {
        updated[id] = { ...updated[id], status: "pending", error: null };
      }
    });
    useAppStore.setState({ liveTasks: updated });
    await handleStartDownload();
  };

  const toggleExpandSpec = (id: string) => {
    setExpandedSpecs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered items for library
  const filteredLibrary = downloadedItems.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.path.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (typeFilter === "course") return !item.is_spec;
    if (typeFilter === "spec") return item.is_spec;
    return true;
  });

  const tasksArray: DownloadTask[] = Object.values(liveTasks);
  const completedCount = tasksArray.filter((t) => t.status === "completed").length;
  const downloadingCount = tasksArray.filter((t) => t.status === "downloading").length;
  const failedCount = tasksArray.filter((t) => t.status === "failed").length;
  const totalCount = tasksArray.length;

  const totalBytes =
    tasksArray.reduce((acc, t) => acc + (t.total_bytes || 0), 0) ||
    activeManifest?.total_size_est ||
    0;

  const downloadedBytes = tasksArray.reduce((acc, t) => {
    if (t.status === "completed") {
      return acc + (t.total_bytes || t.downloaded_bytes || 0);
    }
    return acc + (t.downloaded_bytes || 0);
  }, 0);

  const bytesPercent =
    totalBytes > 0
      ? Math.min(100, Math.max(0, (downloadedBytes / totalBytes) * 100))
      : totalCount > 0
      ? (completedCount / totalCount) * 100
      : 0;

  const overallPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const activeDownloadingTasks = tasksArray.filter((t) => t.status === "downloading");

  const filteredTasks = tasksArray.filter((t) => {
    if (taskFilterType === "downloading") return t.status === "downloading";
    if (taskFilterType === "completed") return t.status === "completed";
    if (taskFilterType === "failed") return t.status === "failed";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Destination Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-3 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <HardDrive className="h-6 w-6 text-primary" />
            Downloads & Local Library
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse and open downloaded courses/specializations stored locally, or manage active downloads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Output Directory Pill */}
          <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-lg border border-border/60">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectFolder}
              disabled={isDownloading}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 cursor-pointer"
              title="Change destination folder"
            >
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
              <span className="truncate max-w-[170px] font-mono">{outputDirectory}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenFolder()}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
              title="Open folder in Finder / Explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadDownloadedLibrary}
            disabled={isLoadingLibrary}
            className="h-8 px-2.5 gap-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLibrary ? "animate-spin text-primary" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex items-center justify-between gap-4 border-b border-[#D9D9D9] dark:border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={`px-3.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "library"
                ? "bg-[#0056D2] text-white shadow-xs font-bold"
                : "bg-white dark:bg-white/5 text-[#5F5F5F] dark:text-[#98A2B3] hover:text-[#1F1F1F] dark:hover:text-white border border-[#D9D9D9] dark:border-white/10"
            }`}
          >
            <HardDrive className="h-3.5 w-3.5" />
            Downloaded Library
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 rounded-[4px] ${
                activeTab === "library" ? "bg-white/20 text-white" : "bg-[#EBEEF2] dark:bg-white/10 text-[#5F5F5F] dark:text-[#98A2B3]"
              }`}
            >
              {downloadedItems.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`px-3.5 py-1.5 rounded-[6px] text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "queue"
                ? "bg-[#0056D2] text-white shadow-xs font-bold"
                : "bg-white dark:bg-white/5 text-[#5F5F5F] dark:text-[#98A2B3] hover:text-[#1F1F1F] dark:hover:text-white border border-[#D9D9D9] dark:border-white/10"
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            Active Download Queue
            {isDownloading ? (
              <Badge className="bg-amber-400 text-black text-[10px] px-1.5 py-0 animate-pulse font-mono rounded-[4px]">
                Downloading
              </Badge>
            ) : activeManifest ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-[#0056D2] border-[#0056D2]/40 rounded-[4px]">
                Ready
              </Badge>
            ) : null}
          </button>
        </div>
      </div>

      {/* TAB 1: Downloaded Library View */}
      {activeTab === "library" && (
        <div className="space-y-4 animate-in fade-in-50 duration-150">
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5F5F5F] dark:text-[#98A2B3]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search downloaded courses or specializations..."
                className="pl-9 h-9 bg-white dark:bg-[#12131F] border-[#D9D9D9] dark:border-white/15 rounded-[6px] text-xs text-[#1F1F1F] dark:text-white shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-white dark:bg-[#12131F] p-1 rounded-[6px] border border-[#D9D9D9] dark:border-white/10 shadow-xs">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`px-2.5 py-1 rounded-[4px] text-xs transition-colors cursor-pointer ${
                  typeFilter === "all"
                    ? "bg-[#0056D2] text-white font-semibold shadow-xs"
                    : "text-[#5F5F5F] dark:text-[#98A2B3] hover:text-[#1F1F1F] dark:hover:text-white"
                }`}
              >
                All ({downloadedItems.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("course")}
                className={`px-2.5 py-1 rounded-[4px] text-xs transition-colors cursor-pointer ${
                  typeFilter === "course"
                    ? "bg-[#0056D2] text-white font-semibold shadow-xs"
                    : "text-[#5F5F5F] dark:text-[#98A2B3] hover:text-[#1F1F1F] dark:hover:text-white"
                }`}
              >
                Courses ({downloadedItems.filter((i) => !i.is_spec).length})
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter("spec")}
                className={`px-2.5 py-1 rounded-[4px] text-xs transition-colors cursor-pointer ${
                  typeFilter === "spec"
                    ? "bg-[#0056D2] text-white font-semibold shadow-xs"
                    : "text-[#5F5F5F] dark:text-[#98A2B3] hover:text-[#1F1F1F] dark:hover:text-white"
                }`}
              >
                Specializations ({downloadedItems.filter((i) => i.is_spec).length})
              </button>
            </div>
          </div>

          {/* Library Cards Grid */}
          {filteredLibrary.length === 0 ? (
            <Card className="border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] p-12 text-center my-6 shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
              <HardDrive className="h-10 w-10 text-[#5F5F5F] dark:text-[#98A2B3] mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-bold text-[#1F1F1F] dark:text-white mb-1">
                {downloadedItems.length === 0
                  ? "No Downloaded Courses Found"
                  : "No Matching Downloads"}
              </h3>
              <p className="text-xs text-[#5F5F5F] dark:text-[#98A2B3] max-w-md mx-auto mb-5 leading-relaxed">
                {downloadedItems.length === 0
                  ? `No course files were found in "${outputDirectory}". Download courses from "My Courses" or custom slugs to see them here.`
                  : "Try adjusting your search query or filter."}
              </p>
              <Button
                onClick={() => useAppStore.getState().setActiveView("courses")}
                variant="outline"
                size="sm"
                className="gap-1.5 font-semibold text-xs rounded-[4px] border-[#D9D9D9] dark:border-white/15 text-[#0056D2] dark:text-[#2E7BFA] hover:bg-[#F5F7FA] dark:hover:bg-white/5 cursor-pointer shadow-xs"
              >
                <GraduationCap className="h-4 w-4 text-[#0056D2] dark:text-[#2E7BFA]" />
                Browse Enrolled Courses
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLibrary.map((item) => {
                const isSpec = item.is_spec;
                const isExpanded = Boolean(expandedSpecs[item.id]);
                const isCompleted = item.status === "completed" || item.percent >= 100;

                return (
                  <Card
                    key={item.id}
                    className="flex flex-col justify-between border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] transition-all duration-200 shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 overflow-hidden"
                  >
                    <CardHeader className="p-4 pb-3">
                      <div className="flex items-start gap-3.5 mb-2">
                        {/* Course / Spec Cover Art Thumbnail */}
                        <div className="relative h-16 w-24 rounded-[4px] bg-[#1F1F1F] dark:bg-[#0B0B14] overflow-hidden shrink-0 border border-[#D9D9D9]/60 dark:border-white/10">
                          <CachedImage
                            src={item.photo_url}
                            alt={item.title}
                            fallbackIcon={isSpec ? "spec" : "course"}
                            className="w-full h-full object-cover object-center"
                            containerClassName="w-full h-full relative overflow-hidden"
                          />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            {isSpec ? (
                              <Badge className="bg-[#271066]/10 text-[#271066] dark:bg-[#7B61FF]/20 dark:text-[#C4B5FD] border border-[#271066]/20 text-[10px] font-semibold flex items-center gap-1 rounded-[4px] px-1.5 py-0.5">
                                <Layers className="h-3 w-3" />
                                Specialization ({item.sub_courses.length || "Multi"} Courses)
                              </Badge>
                            ) : (
                              <Badge className="bg-[#0056D2]/10 text-[#0056D2] dark:bg-[#2E7BFA]/20 dark:text-[#93B8FF] border border-[#0056D2]/20 text-[10px] font-semibold flex items-center gap-1 rounded-[4px] px-1.5 py-0.5">
                                <BookOpen className="h-3 w-3" />
                                Single Course
                              </Badge>
                            )}

                            {isCompleted ? (
                              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-[10px] font-medium flex items-center gap-1 shrink-0 rounded-[4px] px-1.5 py-0.5">
                                <CheckCircle2 className="h-3 w-3" />
                                Completed
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 text-[10px] font-medium flex items-center gap-1 shrink-0 rounded-[4px] px-1.5 py-0.5">
                                <Clock className="h-3 w-3" />
                                {item.percent.toFixed(0)}% Saved
                              </Badge>
                            )}
                          </div>

                          <CardTitle className="text-[15px] font-bold text-[#1F1F1F] dark:text-white line-clamp-2 leading-[1.3]">
                            {item.title}
                          </CardTitle>
                          <CardDescription className="text-[11px] font-mono text-[#5F5F5F] dark:text-[#98A2B3] line-clamp-1">
                            {item.slug}
                          </CardDescription>
                        </div>
                      </div>

                      {/* File count and size stats */}
                      <div className="pt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-sans text-[#5F5F5F] dark:text-[#98A2B3]">
                          <span>
                            {item.downloaded_files} files • {formatBytes(item.downloaded_bytes)}
                          </span>
                          <span className="font-semibold text-foreground">{item.percent.toFixed(0)}%</span>
                        </div>
                        <Progress
                          value={item.percent}
                          className={`h-1.5 ${
                            isCompleted
                              ? "bg-secondary/80 [&>div]:bg-emerald-500"
                              : "bg-secondary/80 [&>div]:bg-amber-500"
                          }`}
                        />
                      </div>

                      {/* Specialization Nested Course Modules List */}
                      {isSpec && item.sub_courses.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => toggleExpandSpec(item.id)}
                            className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer"
                          >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {item.sub_courses.length} Course Folders Included
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-1 pl-2 border-l-2 border-primary/30 max-h-32 overflow-y-auto custom-scrollbar">
                              {item.sub_courses.map((sub, sIdx) => (
                                <p key={sIdx} className="text-[11px] font-mono text-muted-foreground truncate">
                                  {sub}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardHeader>

                    <CardContent className="p-4 pt-0 mt-auto">
                      <div className="pt-3 border-t border-[#D9D9D9]/70 dark:border-white/10 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-[#5F5F5F] dark:text-[#98A2B3] truncate max-w-[180px]" title={item.path}>
                          {item.path}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenFolder(item.path)}
                            className="h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-[4px] border-[#D9D9D9] dark:border-white/15 text-[#1F1F1F] dark:text-white hover:bg-[#F5F7FA] dark:hover:bg-white/5 cursor-pointer"
                            title="Open in Finder / Explorer"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-[#0056D2] dark:text-[#2E7BFA]" />
                            Open Folder
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => handleResumeOrInspect(item)}
                            disabled={preparingSlug === item.slug}
                            className="h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-[4px] bg-[#0056D2] hover:bg-[#00419e] text-white cursor-pointer shadow-xs"
                            title="Inspect or resume remaining files"
                          >
                            {preparingSlug === item.slug ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3 fill-current" />
                            )}
                            {isCompleted ? "Re-Inspect" : "Resume"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Active Download Queue View */}
      {activeTab === "queue" && (
        <div className="space-y-6 animate-in fade-in-50 duration-150">
          {!activeManifest ? (
            <Card className="border-border/60 bg-card/30 p-16 text-center max-w-xl mx-auto my-6">
              <Download className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <h3 className="text-lg font-semibold text-foreground mb-1">No Active Download Session</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Choose a course from your enrolled list, or pick a downloaded course from the Library to resume.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => setActiveTab("library")} variant="outline" className="gap-2 cursor-pointer">
                  <HardDrive className="h-4 w-4 text-primary" />
                  View Downloaded Library
                </Button>
                <Button onClick={() => useAppStore.getState().setActiveView("courses")} className="gap-2 cursor-pointer">
                  <GraduationCap className="h-4 w-4" />
                  Browse Enrolled Courses
                </Button>
              </div>
            </Card>
          ) : (
            <>
              {/* Manifest Header Controls */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#D9D9D9] dark:border-white/10">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Active Course Thumbnail */}
                  <div className="relative h-16 w-24 rounded-[6px] bg-[#1F1F1F] dark:bg-[#0B0B14] overflow-hidden shrink-0 border border-[#D9D9D9]/70 dark:border-white/10 shadow-xs">
                    <CachedImage
                      src={activeManifest.photo_url}
                      alt={activeManifest.course_name}
                      fallbackIcon={activeManifest.is_spec ? "spec" : "course"}
                      className="w-full h-full object-cover object-center"
                      containerClassName="w-full h-full relative overflow-hidden"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#0056D2]/10 text-[#0056D2] dark:bg-[#2E7BFA]/20 dark:text-[#93B8FF] border border-[#0056D2]/20 text-[11px] font-semibold rounded-[4px] px-2 py-0.5">
                        {activeManifest.is_spec ? "Specialization" : "Course"}
                      </Badge>
                      <span className="font-mono text-xs text-[#5F5F5F] dark:text-[#98A2B3]">{activeManifest.slug}</span>
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-[#1F1F1F] dark:text-white truncate">
                      {activeManifest.course_name}
                    </h1>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                  {failedCount > 0 && !isDownloading && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryFailed}
                      className="h-9 px-3 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-medium cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry {failedCount} Failed
                    </Button>
                  )}

                  <Button
                    size="sm"
                    onClick={handleStartDownload}
                    disabled={isDownloading || (completedCount === totalCount && totalCount > 0)}
                    className="h-9 px-4 gap-2 font-medium shadow-sm cursor-pointer"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading ({downloadingCount > 0 ? `${downloadingCount} active` : "Connecting..."})
                      </>
                    ) : completedCount === totalCount && totalCount > 0 ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        All {totalCount} Completed
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        {completedCount > 0
                          ? `Resume Download (${totalCount - completedCount} remaining)`
                          : `Start Download (${totalCount} files)`}
                      </>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetDownloads}
                    disabled={isDownloading}
                    className="h-9 px-2.5 text-muted-foreground hover:text-destructive cursor-pointer"
                    title="Reset active session"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Progress Card */}
              <Card className="border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] p-5 space-y-4 shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1F1F1F] dark:text-white">Overall Progress</span>
                      <Badge variant="outline" className="text-[10px] font-mono font-semibold text-[#0056D2] border-[#0056D2]/30 dark:text-[#2E7BFA] rounded-[4px] px-1.5 py-0.5">
                        {completedCount} / {totalCount} files finished
                      </Badge>
                      {failedCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] font-mono rounded-[4px]">
                          {failedCount} failed
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-[#5F5F5F] dark:text-[#98A2B3] font-medium font-mono">
                      {formatBytes(downloadedBytes)} downloaded of {formatBytes(totalBytes)} total
                      {completedCount > 0 && !isDownloading ? " • Resumed from existing" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[#0056D2] dark:text-[#2E7BFA] text-xl">
                      {bytesPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <Progress value={bytesPercent} className="h-2.5 bg-[#EBEEF2] dark:bg-white/10 [&>div]:bg-[#0056D2] dark:[&>div]:bg-[#2E7BFA]" />

                {/* Live Active Downloads Strip */}
                {isDownloading && activeDownloadingTasks.length > 0 && (
                  <div className="pt-2 space-y-2 border-t border-[#D9D9D9]/60 dark:border-white/10">
                    <span className="text-[11px] font-semibold text-[#5F5F5F] dark:text-[#98A2B3] uppercase tracking-wider">
                      Currently Downloading ({activeDownloadingTasks.length} threads):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeDownloadingTasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2.5 p-2 rounded-md bg-[#F5F7FA] dark:bg-white/5 border border-[#D9D9D9] dark:border-white/10 text-xs"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0056D2] dark:text-[#2E7BFA] shrink-0" />
                          <div className="truncate flex-1">
                            <p className="truncate font-semibold text-[#1F1F1F] dark:text-white">{t.title}</p>
                            <p className="text-[10px] font-mono text-[#5F5F5F] dark:text-[#98A2B3]">
                              {formatBytes(t.downloaded_bytes)}
                              {t.total_bytes > 0 ? ` / ${formatBytes(t.total_bytes)}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Individual Tasks List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#1F1F1F] dark:text-white">Download Task Queue</h3>
                  <div className="flex items-center gap-1 bg-[#F5F7FA] dark:bg-white/5 p-1 rounded-lg border border-[#D9D9D9] dark:border-white/10 text-xs">
                    {(["all", "downloading", "completed", "failed"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setTaskFilterType(f)}
                        className={`px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer ${
                          taskFilterType === f
                            ? "bg-white dark:bg-[#12131F] text-[#0056D2] dark:text-[#2E7BFA] font-bold shadow-xs border border-[#D9D9D9]/60 dark:border-white/10"
                            : "text-[#5F5F5F] dark:text-[#98A2B3] hover:text-[#1F1F1F] dark:hover:text-white"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredTasks.map((t) => {
                    const isVideo = t.relative_path.endsWith(".mp4");
                    const isHtml = t.relative_path.endsWith(".html");
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] hover:bg-[#F5F7FA] dark:hover:bg-white/5 transition-colors gap-3 shadow-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isVideo ? (
                            <FileVideo className="h-4 w-4 text-[#0056D2] dark:text-[#2E7BFA] shrink-0" />
                          ) : isHtml ? (
                            <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <FileCode className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#1F1F1F] dark:text-white truncate">{t.title}</p>
                            <p className="text-[10px] font-mono text-[#5F5F5F] dark:text-[#98A2B3] truncate">{t.relative_path}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {t.status === "completed" ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30 dark:text-emerald-400 rounded-[4px]">
                              Completed
                            </Badge>
                          ) : t.status === "downloading" ? (
                            <Badge className="bg-[#0056D2]/10 text-[#0056D2] dark:bg-[#2E7BFA]/20 dark:text-[#93B8FF] text-[10px] font-mono animate-pulse rounded-[4px]">
                              Downloading...
                            </Badge>
                          ) : t.status === "failed" ? (
                            <Badge variant="destructive" className="text-[10px] rounded-[4px]">
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] text-[#5F5F5F] dark:text-[#98A2B3] rounded-[4px]">
                              Pending
                            </Badge>
                          )}
                          <span className="text-[11px] font-mono text-[#5F5F5F] dark:text-[#98A2B3] min-w-[75px] text-right">
                            {t.status === "downloading" && t.downloaded_bytes > 0 && t.total_bytes > 0
                              ? `${formatBytes(t.downloaded_bytes)} / ${formatBytes(t.total_bytes)}`
                              : formatBytes(t.total_bytes || t.downloaded_bytes)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
