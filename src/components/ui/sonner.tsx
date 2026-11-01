import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Único sistema de toasts do app. O tema é sempre claro (visual aprovado em
 * branco gelo); antes dependia de next-themes sem o provider correspondente.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // No desktop, à esquerda sobre a barra lateral: os botões de salvar ficam à direita e não podem ser cobertos.
      position="bottom-left"
      mobileOffset={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
