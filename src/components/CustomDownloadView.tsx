import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Download,
  Layers,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useAppStore,
  type CourseManifest,
  type SpecializationDetails,
} from "@/store/useAppStore";
import { SpecializationEnrollmentView } from "@/components/SpecializationEnrollmentView";

export function CustomDownloadView() {
  const [slug, setSlug] = useState("");
  const [isSpec, setIsSpec] = useState(false);
  const [prefixSep, setPrefixSep] = useState(" - ");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [specDetails, setSpecDetails] = useState<SpecializationDetails | null>(null);

  const setActiveManifest = useAppStore((s) => s.setActiveManifest);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const maxResolution = useAppStore((s) => s.maxResolution);

  const handleRefreshSpec = async () => {
    if (!slug.trim()) return;
    try {
      const details = await invoke<SpecializationDetails>("get_specialization_details", {
        slug: slug.trim(),
      });
      setSpecDetails(details);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to recheck specialization details");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (isSpec) {
        // Fetch specialization details and show the Specialization Enrollment View
        const details = await invoke<SpecializationDetails>("get_specialization_details", {
          slug: slug.trim(),
        });
        setSpecDetails(details);
      } else {
        // Direct single course download preparation
        const manifest = await invoke<CourseManifest>("prepare_course_download", {
          slug: slug.trim(),
          isSpec: false,
          prefixSep,
          maxResolution,
        });
        setActiveManifest(manifest);
        setActiveView("downloads");
      }
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to prepare download");
    } finally {
      setIsLoading(false);
    }
  };

  if (specDetails) {
    return (
      <SpecializationEnrollmentView
        specDetails={specDetails}
        prefixSep={prefixSep}
        onBack={() => setSpecDetails(null)}
        onRefresh={handleRefreshSpec}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <Download className="h-6 w-6 text-primary" />
          Download by Course / Specialization Slug
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Provide any Coursera course or specialization URL slug to verify enrollment and download its assets.
        </p>
      </div>

      <Card className="border border-[#D9D9D9] dark:border-white/10 bg-white dark:bg-[#12131F] rounded-[8px] shadow-[0_2px_4px_rgba(0,0,0,0.06)]">
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-lg font-bold text-[#1F1F1F] dark:text-white">Course / Specialization Details</CardTitle>
          <CardDescription className="text-xs text-[#5F5F5F] dark:text-[#98A2B3] leading-relaxed">
            Enter the slug found in the Coursera URL (e.g., https://www.coursera.org/learn/
            <span className="text-[#0056D2] dark:text-[#2E7BFA] font-mono font-medium">linux-and-sql</span> or /specializations/
            <span className="text-[#0056D2] dark:text-[#2E7BFA] font-mono font-medium">deep-learning</span>)
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#5F5F5F] dark:text-[#98A2B3]">
                Slug Name
              </label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. linux-and-sql, machine-learning, deep-learning"
                required
                className="font-mono text-sm bg-white dark:bg-[#0B0B14] border-[#D9D9D9] dark:border-white/15 rounded-[6px]"
              />
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer text-sm text-[#1F1F1F] dark:text-white select-none">
                <input
                  type="checkbox"
                  checked={isSpec}
                  onChange={(e) => setIsSpec(e.target.checked)}
                  className="rounded border-[#D9D9D9] text-[#0056D2] focus:ring-[#0056D2] h-4 w-4"
                />
                <span className="flex items-center gap-1.5 font-medium">
                  <Layers className="h-4 w-4 text-[#5F5F5F] dark:text-[#98A2B3]" />
                  Is Specialization (contains multiple courses)
                </span>
              </label>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#5F5F5F] dark:text-[#98A2B3]">
                Numbering Index Separator
              </label>
              <div className="flex items-center gap-3">
                <Input
                  value={prefixSep}
                  onChange={(e) => setPrefixSep(e.target.value)}
                  placeholder="e.g. ' - ' or '_' or '. '"
                  className="w-32 font-mono text-sm bg-white dark:bg-[#0B0B14] border-[#D9D9D9] dark:border-white/15 rounded-[6px] text-center"
                />
                <span className="text-xs text-[#5F5F5F] dark:text-[#98A2B3]">
                  Preview: <span className="font-mono font-semibold text-[#1F1F1F] dark:text-white">01{prefixSep}Module_Title</span>
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-[6px] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-3 text-xs text-red-600 dark:text-red-400 font-medium">
                {errorMsg}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !slug.trim()}
              className="w-full gap-2 font-semibold text-sm rounded-[4px] bg-[#0056D2] hover:bg-[#00419e] text-white mt-2 shadow-xs cursor-pointer h-10"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isSpec ? "Analyzing Specialization & Enrollment..." : "Generating Manifest & File Tree..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {isSpec ? "Inspect Specialization & Enrollments" : "Analyze & Prepare Download"}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
