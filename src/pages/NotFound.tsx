import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/landing-v2/Logo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#F3F8FC] to-white px-4 py-10">
      <Link to="/" aria-label="EloLab, página inicial" className="mb-6 inline-flex min-h-10 items-center">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-[#DCE6F2] bg-card p-6 text-center shadow-[0_8px_24px_rgba(16,128,202,0.08)] animate-in fade-in slide-in-from-bottom-2 duration-500 sm:p-8">
        <div className="mb-4 bg-gradient-primary bg-clip-text text-7xl font-extrabold text-transparent sm:text-8xl">404</div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Página não encontrada</h1>
        <p className="mb-8 text-muted-foreground">
          A página <code className="break-all rounded-full bg-[#EEF4FA] px-2 py-0.5 text-sm text-[#1080CA]">{location.pathname}</code> não existe ou foi removida.
          Confira o endereço ou siga por um dos caminhos abaixo.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => window.history.back()} className="h-11 gap-2 rounded-full">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button asChild className="h-11 gap-2 rounded-full bg-gradient-primary text-white shadow-md hover:brightness-110">
            <Link to="/dashboard">
              <Home className="h-4 w-4" />
              Ir ao Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
