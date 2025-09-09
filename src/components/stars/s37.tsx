export default function Star37({
  color,
  size,
  stroke,
  strokeWidth,
  pathClassName,
  width,
  height,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  color?: string
  size?: number
  stroke?: string
  pathClassName?: string
  strokeWidth?: number
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 200 200"
      width={size ?? width}
      height={size ?? height}
      {...props}
    >
      <path
        fill={color ?? "currentColor"}
        stroke={stroke}
        strokeWidth={strokeWidth}
        className={pathClassName}
        d="M165.01 168.59c0-16.72-8.826-36.955-26.384-41.325 0 28.12-17.557 53.675-41.283 67.735 12.337-12.35 18.411-31.635 11.388-48.355-20.214 18.43-50.964 26.41-77.347 18.43 16.703 0 36.918-8.835 41.283-26.41-28.092 0-53.621-17.575-67.667-41.325 12.338 12.35 31.603 18.43 48.307 11.4C34.99 88.6 27.018 57.82 34.99 31.41c0 16.72 8.826 36.955 26.384 41.325 0-28.12 17.557-53.675 41.283-67.735C90.32 17.35 84.246 36.635 91.269 53.355c20.215-18.43 50.964-26.41 77.347-18.43-16.703 0-36.918 8.835-41.283 26.41 28.092 0 53.621 17.575 67.667 41.325-12.338-12.35-31.603-18.43-48.307-11.4 18.317 20.14 26.289 50.92 18.317 77.33"
      />
    </svg>
  )
}
