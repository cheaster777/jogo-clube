import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, ArrowLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'login' | 'signup' | 'forgot';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setError(null);
    setSuccess(null);
  };

  const switchMode = (newMode: AuthMode) => {
    resetForm();
    setMode(newMode);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await signIn(email, password);
    if (error) {
      setError(translateError(error.message));
    }
    setLoading(false);
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, fullName);
    if (error) {
      setError(translateError(error.message));
    } else {
      setSuccess('Conta criada! Antes de entrar, confirme seu email — enviamos um link para a sua caixa de entrada.');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await resetPassword(email);
    if (error) {
      setError(translateError(error.message));
    } else {
      setSuccess('Link de recuperação enviado! Verifique sua caixa de entrada.');
    }
    setLoading(false);
  };

  const translateError = (msg: string): string => {
    if (msg.includes('Invalid login credentials')) return 'Email ou senha incorretos.';
    if (msg.includes('Email not confirmed')) return 'Email ainda não confirmado. Verifique sua caixa de entrada.';
    if (msg.includes('User already registered')) return 'Este email já está cadastrado.';
    if (msg.includes('rate limit')) return 'Muitas tentativas. Aguarde um momento.';
    if (msg.includes('Password should be')) return 'A senha deve ter pelo menos 6 caracteres.';
    return msg;
  };

  const titles: Record<AuthMode, { title: string; subtitle: string }> = {
    login: { title: 'Bem-vindo de volta', subtitle: 'Entre na sua conta para continuar' },
    signup: { title: 'Criar Conta', subtitle: 'Junte-se à expedição científica' },
    forgot: { title: 'Recuperar Senha', subtitle: 'Enviaremos um link para seu email' },
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/assets/images/Cópia de Logo (1).png"
            alt="Logo Clube de Ciências"
            className="w-20 h-20 mx-auto mb-4 rounded-xl shadow-md"
          />
          <h1 className="text-2xl font-bold font-serif italic tracking-tight">Clube de Ciências de Bona</h1>
          <p className="text-xs text-ink-muted font-mono uppercase tracking-widest mt-1">Bioindicadores & Impacto Ambiental</p>
        </div>

        {/* Auth Card */}
        <div className="card p-6 md:p-8 shadow-lg">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === 'login' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'login' ? 20 : -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="mb-6">
                {mode !== 'login' && (
                  <button
                    onClick={() => switchMode('login')}
                    className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors mb-4"
                  >
                    <ArrowLeft size={14} /> Voltar ao login
                  </button>
                )}
                <h2 className="text-xl font-bold font-serif italic">{titles[mode].title}</h2>
                <p className="text-sm text-ink-secondary mt-1">{titles[mode].subtitle}</p>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 bg-danger-light border border-danger/20 rounded-lg mb-4"
                >
                  <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
                  <p className="text-sm text-danger">{error}</p>
                </motion.div>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 bg-success-light border border-success/20 rounded-lg mb-4"
                >
                  <CheckCircle size={16} className="text-success shrink-0 mt-0.5" />
                  <p className="text-sm text-success">{success}</p>
                </motion.div>
              )}

              {/* Forms */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="label block mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="input-field pl-10"
                        placeholder="seu@email.com"
                        required
                        autoComplete="email"
                        id="login-email"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="login-password" className="label block mb-1.5">Senha</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="input-field pl-10"
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        id="login-password"
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary btn-lg w-full"
                    id="btn-login"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Entrar'}
                  </button>

                  <p className="text-center text-sm text-ink-secondary">
                    Não tem uma conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="text-accent font-semibold hover:text-accent-hover transition-colors"
                    >
                      Criar conta
                    </button>
                  </p>
                </form>
              )}

              {mode === 'signup' && !success && (
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div>
                    <label htmlFor="signup-name" className="label block mb-1.5">Nome Completo</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        className="input-field pl-10"
                        placeholder="Seu nome"
                        required
                        autoComplete="name"
                        id="signup-name"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="signup-email" className="label block mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="input-field pl-10"
                        placeholder="seu@email.com"
                        required
                        autoComplete="email"
                        id="signup-email"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label block mb-1.5">Senha</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="input-field pl-10"
                        placeholder="Mínimo 6 caracteres"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        id="signup-password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-accent btn-lg w-full"
                    id="btn-signup"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Criar Conta'}
                  </button>

                  <p className="text-center text-sm text-ink-secondary">
                    Já tem uma conta?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="text-accent font-semibold hover:text-accent-hover transition-colors"
                    >
                      Entrar
                    </button>
                  </p>
                </form>
              )}

              {mode === 'forgot' && !success && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="label block mb-1.5">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="input-field pl-10"
                        placeholder="seu@email.com"
                        required
                        autoComplete="email"
                        id="forgot-email"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary btn-lg w-full"
                    id="btn-reset"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Enviar Link de Recuperação'}
                  </button>
                </form>
              )}

              {success && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => switchMode('login')}
                    className="btn btn-secondary"
                  >
                    Ir para Login
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-ink-muted mt-6 font-mono uppercase tracking-widest">
          Clube de Ciências de Bona © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}
