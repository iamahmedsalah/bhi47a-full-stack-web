import * as React from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends React.ComponentProps<"input"> {
  showLockIcon?: boolean;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, showLockIcon = true, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative w-full">
        {showLockIcon && (
          <div className="absolute inset-y-0 start-3 flex items-center text-muted-foreground pointer-events-none">
            <Lock className="w-4 h-4" />
          </div>
        )}
        <input
          type={showPassword ? "text" : "password"}
          className={cn(
            "flex h-10 w-full rounded-squircle border border-border bg-surface/50 px-3 py-2 text-base placeholder:text-muted-foreground hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-all",
            showLockIcon ? "ps-10" : "ps-3",
            "pe-10",
            className
          )}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          tabIndex={-1}
          className="absolute inset-y-0 end-3 flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {showPassword ? (
            <EyeOff className="w-4.5 h-4.5" />
          ) : (
            <Eye className="w-4.5 h-4.5" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
