"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      closeButton
      expand={false}
      position="top-right"
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast rounded-base border-2 border-border bg-background text-foreground shadow-shadow font-base",
          title: "font-heading text-sm text-foreground",
          description: "text-xs font-base text-foreground/80",
          actionButton:
            "!rounded-base !border-2 !border-border !bg-main !text-main-foreground !shadow-shadow !font-black",
          cancelButton:
            "!rounded-base !border-2 !border-border !bg-secondary-background !text-foreground !shadow-shadow !font-black",
          closeButton:
            "!rounded-base !border-2 !border-border !bg-secondary-background !text-foreground !shadow-shadow !opacity-100",
          success: "!border-green-700",
          error: "!border-red-700",
          warning: "!border-yellow-700",
          info: "!border-blue-700",
          loading: "!border-border",
        },
      }}
      {...props}
    />
  )
}
