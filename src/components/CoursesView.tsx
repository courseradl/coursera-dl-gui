import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  GraduationCap,
  Download,
  Loader2,
  RefreshCw,
  Search,
  BookOpen,
  Sparkles,
  CheckCircle2,
  FolderOpen,
  Play,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAppStore,
  type EnrolledCourse,
  type CourseManifest,
  type CourseDownloadInfo,
} from "@/store/useAppStore";
import { formatBytes } from "@/lib/utils";
import { CachedImage } from "@/components/CachedImage";

function CourseCardSkeleton() {
  return (
    <Card className="flex flex-col justify-between border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
      {/* Cover Image Skeleton */}
      <Skeleton className="h-32 w-full rounded-none" />

      <CardHeader className="p-4 pb-3 space-y-3">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-28 rounded-xs" />
          <Skeleton className="h-4 w-16 rounded-xs" />
        </div>

        {/* Title */}
        <div className="space-y-1.5 pt-1">
          <Skeleton className="h-5 w-11/12 rounded-xs" />
          <Skeleton className="h-5 w-3/5 rounded-xs" />
        </div>

        {/* Description */}
        <div className="space-y-1.5 pt-1">
          <Skeleton className="h-3.5 w-full rounded-xs" />
          <Skeleton className="h-3.5 w-4/5 rounded-xs" />
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 mt-auto">
        <div className="pt-3 border-t border-[#D9D9D9]/70 dark:border-white/10 flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-24 rounded-xs" />
          <Skeleton className="h-8 w-24 rounded-[4px]" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CoursesView() {
  const user = useAppStore((s) => s.user);
  const coursesCache = useAppStore((s) => s.coursesCache);
  const lastCoursesFetchedAt = useAppStore((s) => s.lastCoursesFetchedAt);
  const setCachedCoursesForUser = useAppStore((s) => s.setCachedCoursesForUser);
  const setLastCoursesFetchedAt = useAppStore((s) => s.setLastCoursesFetchedAt);
  const downloadStatusMap = useAppStore((s) => s.downloadStatusMap);
  const setDownloadStatusMap = useAppStore((s) => s.setDownloadStatusMap);
  const activeManifest = useAppStore((s) => s.activeManifest);
  const isDownloading = useAppStore((s) => s.isDownloading);
  const currentProgress = useAppStore((s) => s.currentProgress);
  const setActiveManifest = useAppStore((s) => s.setActiveManifest);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const maxResolution = useAppStore((s) => s.maxResolution);

  const outputDirectory = useAppStore((s) => s.outputDirectory);

  const userId = user?.user_id || "anonymous";
  const userCachedCourses = coursesCache[userId] || [];

  // 5 minutes in milliseconds
  const SYNC_INTERVAL_MS = 5 * 60 * 1000;

  // If we already have cached courses for this user, display them immediately!
  const hasCachedData = userCachedCourses.length > 0;
  const [courses, setCourses] = useState<EnrolledCourse[]>(userCachedCourses);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!hasCachedData);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [preparingSlug, setPreparingSlug] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Sync state if user changes or cache updates
  useEffect(() => {
    isMountedRef.current = true;
    const cached = coursesCache[userId] || [];
    if (cached.length > 0) {
      setCourses(cached);
      setIsInitialLoading(false);
    } else {
      setCourses([]);
      setIsInitialLoading(true);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [userId]);

  const refreshDownloadStatuses = async (courseList: EnrolledCourse[]) => {
    if (courseList.length === 0) return;
    try {
      if (outputDirectory) {
        await invoke("set_output_directory", { path: outputDirectory });
      }
      const slugs = courseList.map((c) => c.slug);
      const res = await invoke<Record<string, CourseDownloadInfo>>("get_courses_download_status", {
        slugs,
      });
      if (isMountedRef.current && res) {
        setDownloadStatusMap(res);
      }
    } catch (err) {
      console.error("Failed to fetch courses download status", err);
    }
  };

  const fetchCourses = async (isManualRefresh = false) => {
    const cached = coursesCache[userId] || [];
    const lastFetchTime = lastCoursesFetchedAt[userId] || 0;
    const timeSinceLastFetch = Date.now() - lastFetchTime;

    // If not a manual refresh and we already have cached courses fetched less than 5 minutes ago,
    // only refresh local download statuses on disk without hitting the remote API.
    if (!isManualRefresh && cached.length > 0 && timeSinceLastFetch < SYNC_INTERVAL_MS) {
      if (isMountedRef.current) {
        setCourses(cached);
        setIsInitialLoading(false);
      }
      await refreshDownloadStatuses(cached);
      return;
    }

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else if (courses.length === 0 && cached.length === 0) {
      setIsInitialLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const res = await invoke<EnrolledCourse[]>("get_enrolled_courses");
      if (isMountedRef.current) {
        setCourses(res);
        if (userId) {
          setCachedCoursesForUser(userId, res);
          setLastCoursesFetchedAt(userId, Date.now());
        }
        await refreshDownloadStatuses(res);
      }
    } catch (err) {
      console.error("Failed to fetch enrolled courses", err);
    } finally {
      if (isMountedRef.current) {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    fetchCourses(false);
  }, [userId, outputDirectory]);

  // Check download statuses whenever cached courses or outputDirectory are present
  useEffect(() => {
    if (courses.length > 0) {
      refreshDownloadStatuses(courses);
    }
  }, [courses.length, outputDirectory, isDownloading]);

  const handleDownloadCourse = async (course: EnrolledCourse) => {
    setPreparingSlug(course.slug);
    try {
      const manifest = await invoke<CourseManifest>("prepare_course_download", {
        slug: course.slug,
        isSpec: false,
        prefixSep: " - ",
        maxResolution,
      });
      setActiveManifest(manifest);
      setActiveView("downloads");
    } catch (err: any) {
      alert(`Error preparing download: ${err}`);
    } finally {
      setPreparingSlug(null);
    }
  };

  const handleOpenFolder = async (folderPath?: string) => {
    try {
      await invoke("open_download_folder", { path: folderPath || null });
    } catch (err) {
      console.error("Failed to open folder", err);
    }
  };

  const filtered = courses.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.partner_name && c.partner_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-[#D9D9D9] dark:border-white/10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F1F1F] dark:text-white flex items-center gap-2.5">
            <GraduationCap className="h-6 w-6 text-[#0056D2] dark:text-[#2E7BFA]" />
            My Enrolled Courses
          </h1>
          <p className="text-sm text-[#5F5F5F] dark:text-[#98A2B3] mt-0.5">
            Track downloaded materials, resume incomplete modules, or start fresh downloads.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCourses(true)}
            disabled={isRefreshing || isInitialLoading}
            className="h-9 gap-1.5 font-semibold text-xs rounded-[4px] border-[#D9D9D9] dark:border-white/15 text-[#1F1F1F] dark:text-white hover:bg-white dark:hover:bg-white/5 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#0056D2] dark:text-[#2E7BFA]" : "text-[#5F5F5F] dark:text-[#98A2B3]"}`} />
            {isRefreshing ? "Syncing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5F5F5F] dark:text-[#98A2B3]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter courses by title, partner or slug..."
          className="pl-9 h-10 bg-white dark:bg-[#12131F] border-[#D9D9D9] dark:border-white/15 rounded-[6px] text-sm text-[#1F1F1F] dark:text-white focus-visible:ring-2 focus-visible:ring-[#0056D2]/30 shadow-xs"
          disabled={isInitialLoading}
        />
      </div>

      {/* Grid of Courses or Shimmer Skeleton */}
      {isInitialLoading ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
            <span>Loading your enrolled courses...</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <CourseCardSkeleton key={`skeleton-${index}`} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60 bg-card/30 p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            {courses.length === 0 ? "No Enrolled Courses Found" : "No Matching Courses"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
            {courses.length === 0
              ? "You don't have any active course enrollments or you can download directly via custom course slug."
              : "Try adjusting your search filter."}
          </p>
          <Button onClick={() => setActiveView("custom_download")} variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Download by Course Slug
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((course) => {
            const downloadInfo = downloadStatusMap[course.slug];
            const isCurrentlyActiveCourse = activeManifest?.slug === course.slug;
            const isCourseDownloading = isCurrentlyActiveCourse && isDownloading;

            const isCompleted = Boolean(
              downloadInfo?.is_completed || downloadInfo?.status === "completed"
            );
            const hasPartial = Boolean(
              !isCompleted && downloadInfo && downloadInfo.downloaded_files > 0
            );
            const percent = isCourseDownloading
              ? currentProgress?.progress_percent || downloadInfo?.percent || 0
              : downloadInfo?.percent || (isCompleted ? 100 : 0);

            return (
              <Card
                key={course.id}
                className="flex flex-col justify-between border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] transition-all duration-200 shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 overflow-hidden group"
              >
                {/* Course Cover Photo / Banner */}
                <div className="relative h-32 w-full bg-[#1F1F1F] dark:bg-[#0B0B14] overflow-hidden">
                  <CachedImage
                    src={course.photo_url}
                    alt={course.name}
                    fallbackIcon="course"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    containerClassName="w-full h-full relative overflow-hidden"
                  />

                  {/* Gradient Overlay for contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

                  {/* Partner Badge / Tag on Top of Image */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                    {course.partner_name ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-[4px] bg-black/70 backdrop-blur-xs text-[11px] font-semibold text-white uppercase tracking-wider truncate max-w-[180px] shadow-xs"
                        title={course.partner_name}
                      >
                        {course.partner_name}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] font-mono text-[10px] text-white/90 bg-black/60 backdrop-blur-xs truncate max-w-[180px]"
                        title={course.slug}
                      >
                        {course.slug}
                      </span>
                    )}

                    {/* Download Status Badge overlay */}
                    {isCourseDownloading ? (
                      <Badge className="bg-[#0056D2] text-white border-0 text-[10px] font-medium flex items-center gap-1 shrink-0 animate-pulse rounded-[4px] px-2 py-0.5 shadow-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {percent.toFixed(0)}%
                      </Badge>
                    ) : isCompleted ? (
                      <Badge className="bg-emerald-600 text-white border-0 text-[10px] font-medium flex items-center gap-1 shrink-0 rounded-[4px] px-2 py-0.5 shadow-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        Downloaded
                      </Badge>
                    ) : hasPartial ? (
                      <Badge className="bg-amber-500 text-white border-0 text-[10px] font-medium flex items-center gap-1 shrink-0 rounded-[4px] px-2 py-0.5 shadow-xs">
                        <Clock className="h-3 w-3" />
                        {percent.toFixed(0)}% Saved
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-[16px] font-bold text-[#1F1F1F] dark:text-white line-clamp-2 leading-[1.35] group-hover:text-[#0056D2] dark:group-hover:text-[#2E7BFA] transition-colors">
                    {course.name}
                  </CardTitle>
                  {course.description && (
                    <CardDescription className="text-[12px] text-[#5F5F5F] dark:text-[#98A2B3] line-clamp-2 mt-1.5 leading-relaxed">
                      {course.description}
                    </CardDescription>
                  )}

                  {/* Progress Bar for downloaded / partial courses */}
                  {(hasPartial || isCompleted || isCourseDownloading) && (
                    <div className="pt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-sans text-[#5F5F5F] dark:text-[#98A2B3]">
                        <span>
                          {isCourseDownloading && currentProgress
                            ? `${currentProgress.overall_completed}/${currentProgress.overall_total} files`
                            : downloadInfo?.total_files
                            ? `${downloadInfo.downloaded_files}/${downloadInfo.total_files} files`
                            : `${downloadInfo?.downloaded_files || 0} files on disk`}
                          {downloadInfo?.downloaded_bytes ? ` • ${formatBytes(downloadInfo.downloaded_bytes)}` : ""}
                        </span>
                        <span className="font-semibold text-[#1F1F1F] dark:text-white">{percent.toFixed(0)}%</span>
                      </div>
                      <Progress
                        value={percent}
                        className={`h-1.5 rounded-full ${
                          isCompleted
                            ? "bg-[#EBEEF2] dark:bg-white/10 [&>div]:bg-emerald-600 dark:[&>div]:bg-emerald-500"
                            : hasPartial
                            ? "bg-[#EBEEF2] dark:bg-white/10 [&>div]:bg-amber-500"
                            : "bg-[#EBEEF2] dark:bg-white/10 [&>div]:bg-[#0056D2] dark:[&>div]:bg-[#2E7BFA]"
                        }`}
                      />
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-0 mt-auto">
                  <div className="pt-3 border-t border-[#D9D9D9]/70 dark:border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-[#5F5F5F] dark:text-[#98A2B3]">
                      {isCompleted
                        ? "Saved locally"
                        : hasPartial
                        ? "Resume ready"
                        : "Available to download"}
                    </span>

                    {isCompleted ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenFolder(downloadInfo?.path)}
                          className="gap-1.5 h-8 px-2.5 text-xs font-semibold rounded-[4px] border-[#D9D9D9] dark:border-white/15 text-[#1F1F1F] dark:text-white hover:bg-[#F5F7FA] dark:hover:bg-white/5 cursor-pointer"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-[#0056D2] dark:text-[#2E7BFA]" />
                          Open Folder
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadCourse(course)}
                          disabled={preparingSlug === course.slug}
                          title="Verify or redownload course"
                          className="h-8 px-2 text-xs rounded-[4px] text-[#5F5F5F] hover:text-[#1F1F1F] dark:text-[#98A2B3] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-white/5 cursor-pointer"
                        >
                          {preparingSlug === course.slug ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    ) : hasPartial ? (
                      <Button
                        size="sm"
                        onClick={() => handleDownloadCourse(course)}
                        disabled={preparingSlug === course.slug}
                        className="gap-1.5 h-8 px-3 text-xs font-semibold rounded-[4px] bg-[#0056D2] hover:bg-[#00419e] text-white cursor-pointer shadow-xs"
                      >
                        {preparingSlug === course.slug ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-current" />
                            Resume Download
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleDownloadCourse(course)}
                        disabled={preparingSlug === course.slug}
                        className="gap-1.5 h-8 px-3 text-xs font-semibold rounded-[4px] bg-[#0056D2] hover:bg-[#00419e] text-white cursor-pointer shadow-xs"
                      >
                        {preparingSlug === course.slug ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


