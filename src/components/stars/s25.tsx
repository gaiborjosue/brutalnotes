export default function Star25({
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
        d="M118.05 118.05c102.6 102.6-138.7 102.6-36.1 0-102.6 102.6-102.6-138.7 0-36.1-102.6-102.6 138.7-102.6 36.1 0 102.6-102.6 102.6 138.7 0 36.1"
      />
    </svg>
  )
}
