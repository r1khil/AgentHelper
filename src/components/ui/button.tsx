import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// One control vocabulary: ink primary, grey secondary, 6px corners, 30px tall. Outline is the secondary look (the new
// look draws no outlined buttons); destructive is a grey button with red words.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-body font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:bg-border-strong disabled:text-ink-2 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary),var(--background)_18%)]",
        outline: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)]",
        ghost: "text-ink-3 hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground",
        destructive: "bg-secondary text-destructive hover:bg-[color-mix(in_oklab,var(--secondary),var(--destructive)_10%)]",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[30px] gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-caption has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-body has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-[30px]",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
