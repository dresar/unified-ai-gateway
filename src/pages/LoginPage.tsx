import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap } from "lucide-react";

const LoginPage = () => {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const { error } = isSignUp ? await signUp(email, password) : await signIn(email, password);

    if (error) {
      setError(error.message);
    } else if (isSignUp) {
      setSuccess("Akun berhasil dibuat! Silakan cek email untuk verifikasi.");
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
          <p className="text-muted-foreground">AI & Media API Management Platform</p>
        </div>

        <div className="card-elevated rounded-xl border border-border p-6">
          <h2 className="mb-6 text-center font-heading text-xl font-semibold text-foreground">
            {isSignUp ? "Buat Akun Admin" : "Login Admin"}
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
            {success && <p className="text-sm text-success">{success}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isSignUp ? "Buat Akun" : "Masuk"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccess(""); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? "Sudah punya akun? Login" : "Belum punya akun? Daftar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
