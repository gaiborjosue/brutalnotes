import { toast } from "sonner"

export function showSuccessToast(title: string, description?: string, duration = 3000): void {
  toast.success(title, { description, duration })
}

export function showErrorToast(title: string, description?: string, duration = 4000): void {
  toast.error(title, { description, duration })
}

export function showInfoToast(title: string, description?: string, duration = 3000): void {
  toast.info(title, { description, duration })
}

export function showWarningToast(title: string, description?: string, duration = 3500): void {
  toast.warning(title, { description, duration })
}

export function showProcessingToast(title: string, description?: string): () => void {
  const toastId = toast.loading(title, {
    description,
    duration: Number.POSITIVE_INFINITY,
  })

  return () => toast.dismiss(toastId)
}
