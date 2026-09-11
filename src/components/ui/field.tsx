import { cn } from "@/components/utils";

/**
 * Native form controls on purpose. This app posts real <form>s to server
 * actions and works with JavaScript disabled; every mutation, disclosure and
 * dropdown is a native element. Radix Select/Checkbox would break that, and
 * the completion flow relies on repeated same-name checkboxes read via
 * FormData.getAll("sourceId") -- see the plan, amendment A4.
 */

const control =
  "border-input bg-card text-foreground placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-[13px] disabled:opacity-60";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(control, "min-h-24 resize-y leading-relaxed", className)}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(control, "appearance-none pr-8", className)}
      {...props}
    />
  );
}

/** Wraps its control, so association needs no htmlFor/id pair. */
function Field({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="field"
      className={cn(
        "text-muted-foreground flex flex-col gap-1.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function CheckboxField({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="checkbox-field"
      className={cn(
        "text-foreground flex cursor-pointer items-start gap-2 py-1 text-[13px] font-normal",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea, Select, Field, CheckboxField };
