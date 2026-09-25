import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  GraduationCap,
  Download,
  FolderDown,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type DownloadProgressEvent } from "@/store/useAppStore";
import { CoursesView } from "@/components/CoursesView";
import { CustomDownloadView } from "@/components/CustomDownloadView";
import { DownloadsView } from "@/components/DownloadsView";
import { SettingsView } from "@/components/SettingsView";

export function Layout() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const user = useAppStore((s) => s.user);
  const activeManifest = useAppStore((s) => s.activeManifest);
  const isDownloading = useAppStore((s) => s.isDownloading);
  const setIsDownloading = useAppStore((s) => s.setIsDownloading);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const { theme, setTheme } = useTheme();

  // Global persistent event listener for download progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DownloadProgressEvent>("download_progress", (event) => {
      updateProgress(event.payload);
      if (
        event.payload.task_id === "all" ||
        (event.payload.overall_completed === event.payload.overall_total &&
          event.payload.overall_total > 0)
      ) {
        setIsDownloading(false);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to setup download_progress listener", err);
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [updateProgress, setIsDownloading]);

  const navItems = [
    {
      id: "courses" as const,
      label: "My Courses",
      icon: GraduationCap,
    },
    {
      id: "custom_download" as const,
      label: "Course Slug DL",
      icon: Download,
    },
    {
      id: "downloads" as const,
      label: "Active Downloads",
      icon: FolderDown,
      badge: isDownloading ? "Active" : activeManifest ? "Ready" : undefined,
    },
    {
      id: "settings" as const,
      label: "Settings",
      icon: SettingsIcon,
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-none">
      {/* Sidebar matching CF Studio black layered design */}
      <aside className="w-64 flex flex-col border-r border-sidebar-border bg-sidebar shrink-0 justify-between">
        <div className="flex flex-col">
          {/* Logo & Brand */}
          <div className="h-14 px-4 flex items-center gap-2.5 border-b border-sidebar-border">
            <img
              src="/logo.png"
              alt="Coursera DL Logo"
              className="h-8 w-8 drop-shadow-xs object-contain"
            />
            <div>
              <span className="font-bold text-sm tracking-tight text-foreground">Coursera DL</span>
              <span className="block text-[10px] font-mono text-muted-foreground">v1.0.0</span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Workspace
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all group cursor-pointer",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0 h-4 border-primary/30",
                        isDownloading && item.id === "downloads"
                          ? "bg-primary text-primary-foreground animate-pulse"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Info & Theme Controls at bottom */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
          {/* User pill */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 min-w-0">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user?.name || "User Avatar"}
                  className="h-6 w-6 rounded-full object-cover shrink-0 border border-border/40 shadow-xs"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
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
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{user?.name || "Learner"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email || (user?.user_id ? `ID: ${user.user_id}` : "Authenticated")}</p>
              </div>
            </div>
          </div>

          {/* Theme Switcher */}
          <div className="flex items-center justify-between px-2 pt-1 text-xs text-muted-foreground">
            <span>Theme</span>
            <div className="flex items-center gap-1 bg-secondary/50 p-0.5 rounded-md border border-border/40">
              <button
                onClick={() => setTheme("dark")}
                className={cn("p-1 rounded transition-colors", theme === "dark" ? "bg-background text-foreground" : "hover:text-foreground")}
              >
                <Moon className="h-3 w-3" />
              </button>
              <button
                onClick={() => setTheme("light")}
                className={cn("p-1 rounded transition-colors", theme === "light" ? "bg-background text-foreground" : "hover:text-foreground")}
              >
                <Sun className="h-3 w-3" />
              </button>
              <button
                onClick={() => setTheme("system")}
                className={cn("p-1 rounded transition-colors", theme === "system" ? "bg-background text-foreground" : "hover:text-foreground")}
              >
                <Monitor className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {activeView === "courses" && <CoursesView />}
          {activeView === "custom_download" && <CustomDownloadView />}
          {activeView === "downloads" && <DownloadsView />}
          {activeView === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}
