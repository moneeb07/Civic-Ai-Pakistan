"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";


interface PasswordInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(function PasswordInput({ className, invalid, ...props }, ref) {
  const t = useT();
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        invalid={invalid}
        className={cn("pe-12", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        // Not in the tab order: keyboard users reach the next field directly,
        // and the control is still available to pointer and screen-reader users.
        tabIndex={-1}
        className="absolute end-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-civic-50 hover:text-civic-600"
        aria-label={visible ? t.common.hidePassword : t.common.showPassword}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="size-[18px]" aria-hidden="true" />
        ) : (
          <Eye className="size-[18px]" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
