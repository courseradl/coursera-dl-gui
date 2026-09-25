import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound, ShieldAlert, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useAppStore, type UserProfile } from "@/store/useAppStore";

export function LoginView() {
  const [cookiesInput, setCookiesInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const setUser = useAppStore((s) => s.setUser);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cookiesInput.trim()) return;

    setIsLoading(true);
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
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

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
            Sign in with your Coursera session cookies to browse courses and download high-quality videos & materials.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Paste Cookies.txt / Netscape Cookies
              </label>
              <textarea
                value={cookiesInput}
                onChange={(e) => setCookiesInput(e.target.value)}
                placeholder="# Netscape HTTP Cookie File&#10;.coursera.org  TRUE  /  TRUE  1754026047  CAUTH  ..."
                rows={8}
                className="w-full rounded-md border border-input bg-background/80 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent custom-scrollbar resize-none"
                required
              />
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive-foreground">
                <ShieldAlert className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !cookiesInput.trim()}
              className="w-full font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating & Connecting...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Authenticate & Save Session
                </>
              )}
            </Button>
          </form>

          <div className="rounded-md border border-border/50 bg-secondary/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              How to export your cookies:
            </p>
            <p>1. Open Chrome / Edge / Brave and log in to <span className="text-foreground">coursera.org</span>.</p>
            <p>2. Use an extension like <span className="text-foreground">"Get cookies.txt LOCALLY"</span> to export.</p>
            <p>3. Paste the contents above. Your cookies are stored safely on your machine.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
