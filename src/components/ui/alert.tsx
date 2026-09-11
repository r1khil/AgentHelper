import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/components/utils";

const alertVariants = cva("rounded-md border px-4 py-3 text-[13px]", {
  variants: {
    variant: {
      default: "border-notice-border bg-notice-surface text-notice",
      destructive:
        "border-quality-fail-border bg-quality-fail-surface text-quality-fail",
      muted: "border-border bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("mb-1 font-semibold", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, alertVariants };
