import Star26 from "@/components/stars/s26"

export default function StarDarkModeStroke() {
  return (
    <Star26
      className="text-red-500 dark:text-blue-500"
      pathClassName="stroke-black dark:stroke-white"
      size={200}
      strokeWidth={2}
    />
  )
}
