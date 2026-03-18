import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";

const showDevLogin = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";

const LoginPage = () => {
  const { signIn, devLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  const handleDevLogin = async () => {
    setError("");
    setLoading(true);
    const { error } = await devLogin();
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-mono text-sm text-primary">API Gateway</span>
          </div>
          <h1 className="mb-2 font-heading text-3xl font-bold text-foreground">
            Universal <span className="gradient-text">Gateway</span>
          </h1>
          <p className="text-muted-foreground">Platform gateway terpadu untuk operasional API AI dan media.</p>
        </div>

        <div className="card-elevated rounded-xl border border-border p-6">
          <h2 className="mb-6 text-center font-heading text-xl font-semibold text-foreground">
            Masuk ke Dashboard
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-primary"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
            </Button>

            {showDevLogin && (
              <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={handleDevLogin}>
                Login Dev
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
