import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface AuthSwitchProps {
  activeTab: "login" | "signup";
  onTabChange: (tab: "login" | "signup") => void;
}
export function AuthSwitch({ activeTab, onTabChange }: AuthSwitchProps) {
  return (
    <div role="group" aria-label="Modo de acesso" className="relative flex w-full rounded-xl border border-border bg-muted p-1">
      {/* Animated pill background */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg border border-primary/20 bg-primary/5"
        layout
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        style={{
          left: activeTab === "login" ? "4px" : "calc(50% + 0px)",
          width: "calc(50% - 4px)",
        }}
      />

      <button
        type="button"
        onClick={() => onTabChange("login")}
        aria-pressed={activeTab === "login"}
        className={cn(
          "relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          activeTab === "login"
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground/70"
        )}
      >
        Entrar
      </button>
      <button
        type="button"
        onClick={() => onTabChange("signup")}
        aria-pressed={activeTab === "signup"}
        className={cn(
          "relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          activeTab === "signup"
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground/70"
        )}
      >
        Criar Conta
      </button>
    </div>
  );
}

