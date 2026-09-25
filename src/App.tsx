import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { LoginView } from "@/components/LoginView";
import { useAppStore, type UserProfile } from "@/store/useAppStore";
import { Loader2 } from "lucide-react";

export default function App() {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    invoke<UserProfile>("check_auth")
      .then((profile) => {
        if (!cancelled) {
          setUser(profile);
        }
      })
      .catch((_err) => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingAuth(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (isCheckingAuth) {
    return (
      <ThemeProvider defaultTheme="light" storageKey="coursera-dl-theme">
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground relative overflow-hidden select-none">
          {/* Ambient background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-primary/15 rounded-full blur-[100px] pointer-events-none animate-pulse" />

          <div className="flex flex-col items-center gap-5 relative z-10">
            {/* Animated Logo Container with soft radiating ring */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-lg animate-splash-ring pointer-events-none" />
              <img
                src="/logo.png"
                alt="Coursera DL Logo"
                className="h-20 w-20 object-contain drop-shadow-2xl animate-splash-logo relative z-10"
              />
            </div>

            {/* Title & Status */}
            <div className="flex flex-col items-center gap-1.5">
              <h1 className="text-lg font-bold tracking-tight text-foreground">Coursera DL</h1>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <p className="text-xs font-mono text-muted-foreground animate-pulse">
                  Initializing application...
                </p>
              </div>
            </div>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="light" storageKey="coursera-dl-theme">
      {user && user.is_authenticated ? <Layout /> : <LoginView />}
    </ThemeProvider>
  );
}
