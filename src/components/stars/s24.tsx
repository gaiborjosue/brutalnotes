export default function Star24({
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
        d="M117.577 52.5 100 5 82.423 52.5H62.5c-5.523 0-10 4.477-10 10v19.923L5 100l47.5 17.577V137.5c0 5.523 4.477 10 10 10h19.923L100 195l17.577-47.5H137.5c5.523 0 10-4.477 10-10v-19.923L195 100l-47.5-17.577V62.5c0-5.523-4.477-10-10-10z"
        clipRule="evenodd"
        fillRule="evenodd"
      />
    </svg>
  )
}
