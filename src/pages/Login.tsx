import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, Shield } from 'lucide-react';
import logoImg from '@/assets/logo.jpg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full border border-primary-foreground/30" />
          <div className="absolute bottom-32 right-16 w-96 h-96 rounded-full border border-primary-foreground/20" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full border border-primary-foreground/15" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <img src={logoImg} alt="Myeloma GeneSight" className="h-10 w-auto rounded-lg" />
            <h1 className="text-xl font-semibold text-primary-foreground tracking-tight">Myeloma GeneSight</h1>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-3xl font-bold text-primary-foreground leading-tight max-w-md">
            Evidence-based clinical decision support for multiple myeloma genomics
          </h2>
          <p className="text-primary-foreground/70 max-w-sm text-sm leading-relaxed">
            Upload VCF files from exome or whole genome sequencing. Get structured, auditable clinical interpretations ready for physician review.
          </p>
          <div className="flex items-center gap-2 text-primary-foreground/50 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Clinical decision support — never a substitute for medical judgment
          </div>
        </div>

        <div className="relative z-10 text-primary-foreground/40 text-xs">
          © 2026 Myeloma GeneSight. All rights reserved.
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <img src={logoImg} alt="Myeloma GeneSight" className="h-9 w-auto" />
            <span className="font-semibold text-lg tracking-tight">Myeloma <span className="text-primary">GeneSight</span></span>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-4">
              <h2 className="text-xl font-semibold">Sign in</h2>
              <p className="text-sm text-muted-foreground">Access your clinical genomics workspace</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="doctor@institution.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <div className="text-center mt-4">
                <Link to="/signup" className="text-sm text-primary hover:underline">
                  Don't have an account? Sign up
                </Link>
              </div>

              <p className="text-[10px] text-muted-foreground text-center mt-4 leading-relaxed">
                By signing in, you acknowledge that this system is for authorized clinical personnel only.
                All access is logged for compliance and audit purposes.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
