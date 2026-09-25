import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { 
  KeyRound, 
  ShieldAlert, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useAppStore, type UserProfile } from "@/store/useAppStore";

export function LoginView() {
  const [cookiesInput, setCookiesInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isWebviewLoading, setIsWebviewLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showCookieLogin, setShowCookieLogin] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("coursera-verifying-details", () => {
      setIsVerifying(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleManualLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cookiesInput.trim()) return;

    setIsLoading(true);
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const profile = await invoke<UserProfile>("login_with_cookies", {
        cookies: cookiesInput.trim(),
      });
      setUser(profile);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Failed to validate cookies");
    } finally {
      setIsLoading(false);
      setIsVerifying(false);
    }
  };

  const startWebviewLogin = async () => {
    setIsWebviewLoading(true);
    setIsVerifying(false);
    setErrorMsg(null);

    try {
      const profile = await invoke<UserProfile>("open_login_webview");
      setUser(profile);
    } catch (err: any) {
      setErrorMsg(typeof err === "string" ? err : err?.message || "Coursera login was cancelled or failed");
    } finally {
      setIsWebviewLoading(false);
      setIsVerifying(false);
    }
  };

  const cancelWebviewLogin = async () => {
    try {
      await invoke("cancel_login_webview");
    } catch (_) {}
    setIsWebviewLoading(false);
    setIsVerifying(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Verifying Details Loading Modal */}
      {isVerifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm rounded-2xl border border-primary/20 bg-card/95 p-8 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                Verifying details...
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Checking your account session with Coursera and syncing your profile.
              </p>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full w-2/3 rounded-full animate-[shimmer_1.5s_infinite]" />
            </div>
          </div>
        </div>
      )}

      <Card className="w-full max-w-lg border-border/80 bg-card/60 backdrop-blur-xl shadow-2xl relative z-10">
        <CardHeader className="text-center pb-4">
          <img
            src="/logo.png"
            alt="Coursera DL Logo"
            className="mx-auto mb-3 h-16 w-16 drop-shadow-lg object-contain"
          />
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
            Coursera DL
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Sign in to Coursera to browse your enrolled courses and download high-quality videos & materials.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <Button
              type="button"
              onClick={() => {
                if (isWebviewLoading) {
                  cancelWebviewLogin();
                } else {
                  startWebviewLogin();
                }
              }}
              variant={isWebviewLoading ? "destructive" : "default"}
              className="h-12 w-full font-medium shadow-sm"
            >
              {isWebviewLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancel login
                </>
              ) : (
                <>
                  <img src="/coursera-logo.svg" alt="" className="mr-2 h-5 w-5 object-contain" />
                  Login with Coursera
                </>
              )}
            </Button>

            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant={showCookieLogin ? "secondary" : "outline"}
              disabled={isWebviewLoading}
              aria-expanded={showCookieLogin}
              aria-controls="cookie-login-form"
              onClick={() => {
                setShowCookieLogin((expanded) => !expanded);
                setErrorMsg(null);
              }}
              className="h-12 w-full font-medium"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Login using Coursera cookies
              <ChevronDown
                className={`ml-2 h-4 w-4 transition-transform ${showCookieLogin ? "rotate-180" : ""}`}
              />
            </Button>
          </div>

          {showCookieLogin && (
            <div
              id="cookie-login-form"
              className="rounded-xl border border-border/70 bg-secondary/20 p-4 animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <form onSubmit={handleManualLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Netscape / cookies.txt format</span>
                    <KeyRound className="h-3.5 w-3.5" />
                  </label>
                  <textarea
                    value={cookiesInput}
                    onChange={(e) => setCookiesInput(e.target.value)}
                    placeholder="# Netscape HTTP Cookie File&#10;.coursera.org  TRUE  /  TRUE  1754026047  CAUTH  ..."
                    rows={6}
                    autoFocus
                    className="w-full resize-none rounded-md border border-input bg-background/80 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring custom-scrollbar"
                  />
                </div>

                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isLoading || !cookiesInput.trim()}
                  className="w-full font-medium"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying details...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Login with cookies
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-4 space-y-1 rounded-md border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Cookie export guide
                </p>
                <p>1. Log in at <span className="font-medium text-foreground">coursera.org</span> using Chrome, Edge, or Brave.</p>
                <p>2. Export cookies using Cookie-Editor or Get cookies.txt LOCALLY.</p>
                <p>3. Paste the exported contents above.</p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{errorMsg}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
