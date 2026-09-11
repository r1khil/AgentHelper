import { mutate } from "@/app/actions";
import { SubmitButton } from "./submit-button";

/**
 * The universal mutation primitive: a native <form> posting to the single
 * `mutate` server action, which dispatches on the hidden `op` field and
 * finishes with revalidatePath + redirect.
 *
 * `mutate` is referenced from a server component, so the action itself never
 * crosses the client boundary -- only SubmitButton does.
 */
export function ActionForm({
  op,
  id,
  returnTo,
  label,
  pendingLabel,
  className,
  buttonClassName,
  children,
}: {
  op: string;
  id?: string;
  returnTo: string;
  label: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={mutate} className={className}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={id ?? ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {children}
      <SubmitButton className={buttonClassName} pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
