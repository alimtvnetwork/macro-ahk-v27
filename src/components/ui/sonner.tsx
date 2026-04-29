import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      visibleToasts={3}
      position="top-center"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#111111] group-[.toaster]:text-[#e4e4e7] group-[.toaster]:border-[#1a1a1a] group-[.toaster]:shadow-[0_4px_24px_rgba(0,0,0,0.5)] group-[.toaster]:rounded-lg group-[.toaster]:px-4 group-[.toaster]:py-3",
          description: "group-[.toast]:text-[#a1a1aa]",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-[#1a1a1a] group-[.toast]:text-[#a1a1aa]",
          success:
            "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-[#22c55e] group-[.toaster]:border-t-[#1a1a1a] group-[.toaster]:border-r-[#1a1a1a] group-[.toaster]:border-b-[#1a1a1a]",
          error:
            "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-[#ef4444] group-[.toaster]:border-t-[#1a1a1a] group-[.toaster]:border-r-[#1a1a1a] group-[.toaster]:border-b-[#1a1a1a]",
          info: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-[#3b82f6] group-[.toaster]:border-t-[#1a1a1a] group-[.toaster]:border-r-[#1a1a1a] group-[.toaster]:border-b-[#1a1a1a]",
          warning:
            "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-[#f59e0b] group-[.toaster]:border-t-[#1a1a1a] group-[.toaster]:border-r-[#1a1a1a] group-[.toaster]:border-b-[#1a1a1a]",
          closeButton:
            "group-[.toast]:text-[#a1a1aa] group-[.toast]:hover:text-[#e4e4e7]",
        },
        duration: 3000,
      }}
      closeButton
      {...props}
    />
  );
};

export { Toaster, toast };
