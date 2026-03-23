"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogOverlay = AlertDialogPrimitive.Overlay;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <AlertDialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg", className)}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex justify-end gap-2", className)} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function AlertDialogConfirm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={cn(buttonVariants({ variant: "destructive" }), className)} {...props} />;
}

export function AlertDialogDismiss({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />;
}
