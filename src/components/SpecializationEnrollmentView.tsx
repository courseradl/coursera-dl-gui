import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowLeft,
  UserPlus,
  Download,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useAppStore,
  type SpecializationDetails,
  type CourseManifest,
} from "@/store/useAppStore";
import { CachedImage } from "@/components/CachedImage";

interface SpecializationEnrollmentViewProps {
  specDetails: SpecializationDetails;
  prefixSep: string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}

export function SpecializationEnrollmentView({
  specDetails,
  prefixSep,
  onBack,
  onRefresh,
}: SpecializationEnrollmentViewProps) {
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [isEnrollingAll, setIsEnrollingAll] = useState(false);
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const maxResolution = useAppStore((s) => s.maxResolution);
  const setActiveManifest = useAppStore((s) => s.setActiveManifest);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const unenrolledCourses = specDetails.courses.filter((c) => !c.is_enrolled);
  const enrolledPercent =
    specDetails.total_courses > 0
      ? (specDetails.enrolled_courses / specDetails.total_courses) * 100
      : 0;

  const handleEnrollSingle = async (courseId: string) => {
    setEnrollingCourseId(courseId);
    setErrorMsg(null);
    try {
      await invoke("enroll_in_course", { courseId });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to enroll in course");
    } finally {
      setEnrollingCourseId(null);
    }
  };

  const handleEnrollAll = async () => {
    setIsEnrollingAll(true);
    setErrorMsg(null);
    try {
      const courseIds = specDetails.courses.map((c) => c.id);
      await invoke("enroll_in_specialization_all", {
        specId: specDetails.id,
        courseIds,
      });
      await onRefresh();
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to enroll in specialization");
    } finally {
      setIsEnrollingAll(false);
    }
  };

  const handleStartSpecDownload = async () => {
    setIsPreparingDownload(true);
    setErrorMsg(null);
    try {
      const manifest = await invoke<CourseManifest>("prepare_course_download", {
        slug: specDetails.slug,
        isSpec: true,
        prefixSep,
        maxResolution,
      });
      setActiveManifest(manifest);
      setActiveView("downloads");
    } catch (err: any) {
      setErrorMsg(
        typeof err === "string"
          ? err
          : err?.message || "Failed to analyze and prepare specialization download"
      );
    } finally {
      setIsPreparingDownload(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header & Back Button */}
      <div className="flex items-center justify-between pb-3 border-b border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={isPreparingDownload || isEnrollingAll}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Search
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isPreparingDownload || isEnrollingAll}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recheck Enrollment
          </Button>
        </div>
      </div>

      {/* Specialization Overview Card */}
      <Card className="border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
        {/* Specialization Banner Header */}
        <div className="relative h-44 w-full bg-[#1F1F1F] dark:bg-[#0B0B14] overflow-hidden">
          <CachedImage
            src={specDetails.photo_url || specDetails.logo}
            alt={specDetails.name}
            fallbackIcon="spec"
            className="w-full h-full object-cover object-center"
            containerClassName="w-full h-full relative overflow-hidden"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

          <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4 pointer-events-none">
            <div className="space-y-1 pointer-events-auto">
              <div className="flex items-center gap-2">
                <Badge className="bg-[#0056D2] text-white border-0 text-[11px] gap-1 px-2 py-0.5 rounded-[4px] font-semibold">
                  <Layers className="h-3 w-3" />
                  Specialization
                </Badge>
                {specDetails.partner_name && (
                  <span className="text-xs font-semibold text-white/90 uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-[4px] backdrop-blur-xs">
                    {specDetails.partner_name}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-xs">
                {specDetails.name}
              </h1>
            </div>

            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-1 shrink-0 rounded-[4px] font-semibold border-0 text-white pointer-events-auto ${
                specDetails.all_enrolled ? "bg-emerald-600" : "bg-amber-600"
              }`}
            >
              {specDetails.enrolled_courses} of {specDetails.total_courses} Enrolled
            </Badge>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {specDetails.description && (
            <p className="text-sm text-[#5F5F5F] dark:text-[#98A2B3] leading-relaxed">
              {specDetails.description}
            </p>
          )}

          {/* Enrollment Progress Bar */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1F1F1F] dark:text-white">Specialization Enrollment Status</span>
              <span className="font-mono font-bold text-[#0056D2] dark:text-[#2E7BFA]">{enrolledPercent.toFixed(0)}%</span>
            </div>
            <Progress value={enrolledPercent} className="h-2 bg-[#EBEEF2] dark:bg-white/10 [&>div]:bg-[#0056D2] dark:[&>div]:bg-[#2E7BFA]" />
          </div>

          {/* Status Callout Banner */}
          {specDetails.all_enrolled ? (
            <div className="rounded-[6px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium">
                  All {specDetails.total_courses} courses are enrolled! You can now generate the download tree and download the complete specialization.
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-[6px] bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-300">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="font-medium">
                  {unenrolledCourses.length} of {specDetails.total_courses} courses need enrollment before they can be crawled.
                </span>
              </div>
              <Button
                size="sm"
                onClick={handleEnrollAll}
                disabled={isEnrollingAll || isPreparingDownload}
                className="gap-1.5 h-8 px-3 text-xs font-semibold rounded-[4px] bg-[#0056D2] hover:bg-[#00419e] text-white shrink-0 cursor-pointer shadow-xs"
              >
                {isEnrollingAll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enrolling in All...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    Enroll in All {unenrolledCourses.length} Courses
                  </>
                )}
              </Button>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-[6px] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-600 dark:text-red-400 font-medium">
              {errorMsg}
            </div>
          )}
        </div>
      </Card>

      {/* Courses in Specialization List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#5F5F5F] dark:text-[#98A2B3]">
            Courses in this Specialization ({specDetails.courses.length})
          </h3>
          {unenrolledCourses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnrollAll}
              disabled={isEnrollingAll || isPreparingDownload}
              className="h-8 gap-1.5 text-xs font-semibold rounded-[4px] border-[#D9D9D9] dark:border-white/15 text-[#0056D2] dark:text-[#2E7BFA] hover:bg-[#0056D2]/5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Enroll in All Remaining
            </Button>
          )}
        </div>

        <div className="rounded-[8px] border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] overflow-hidden divide-y divide-[#D9D9D9]/70 dark:divide-white/10 shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
          {specDetails.courses.map((course) => (
            <div
              key={course.id}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                course.is_enrolled ? "hover:bg-[#F5F7FA] dark:hover:bg-white/5" : "bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                {/* Course Thumbnail */}
                <div className="relative h-14 w-20 rounded-[4px] bg-[#1F1F1F] dark:bg-[#0B0B14] overflow-hidden shrink-0 border border-[#D9D9D9]/60 dark:border-white/10">
                  <CachedImage
                    src={course.photo_url}
                    alt={course.name}
                    fallbackIcon="course"
                    className="w-full h-full object-cover object-center"
                    containerClassName="w-full h-full relative overflow-hidden"
                  />
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded-xs bg-black/75 text-[9px] font-mono font-bold text-white z-10">
                    #{course.order}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#1F1F1F] dark:text-white truncate">{course.name}</p>
                  <p className="text-[11px] font-mono text-[#5F5F5F] dark:text-[#98A2B3] truncate">{course.slug}</p>
                  {course.description && (
                    <p className="text-[12px] text-[#5F5F5F] dark:text-[#98A2B3] line-clamp-1 mt-0.5">
                      {course.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                {course.is_enrolled ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-[11px] flex items-center gap-1 py-0.5 px-2.5 rounded-[4px] font-medium"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Enrolled
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEnrollSingle(course.id)}
                    disabled={enrollingCourseId === course.id || isEnrollingAll || isPreparingDownload}
                    className="h-8 px-3 text-xs gap-1.5 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 rounded-[4px] font-semibold cursor-pointer"
                  >
                    {enrollingCourseId === course.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Enrolling...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3 w-3" />
                        Enroll
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="pt-2 flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isPreparingDownload || isEnrollingAll}
          className="text-xs h-10 px-4"
        >
          Cancel
        </Button>

        <Button
          onClick={handleStartSpecDownload}
          disabled={isPreparingDownload || isEnrollingAll}
          className="gap-2 font-medium h-10 px-6 shadow-sm"
        >
          {isPreparingDownload ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Crawling Specialization & Preparing Files...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              {specDetails.all_enrolled
                ? "Download Complete Specialization"
                : `Download Enrolled Courses (${specDetails.enrolled_courses}/${specDetails.total_courses})`}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
