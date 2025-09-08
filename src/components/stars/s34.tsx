export default function Star34({
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
        d="M109.5 5h-19v47.24L72.422 8.596l-17.554 7.271 18.078 43.644-33.404-33.404-13.435 13.435 33.404 33.404-43.644-18.078-7.271 17.554L52.24 90.5H5v19h47.24L8.596 127.578l7.271 17.554 43.644-18.078-33.404 33.404 13.435 13.435 33.404-33.404-18.078 43.644 17.554 7.271L90.5 147.76V195h19v-47.24l18.078 43.644 17.554-7.271-18.078-43.644 33.404 33.404 13.435-13.435-33.404-33.404 43.644 18.078 7.271-17.554L147.76 109.5H195v-19h-47.24l43.644-18.078-7.271-17.554-43.644 18.078 33.404-33.404-13.435-13.435-33.404 33.404 18.078-43.644-17.554-7.271L109.5 52.24z"
        clipRule="evenodd"
        fillRule="evenodd"
      />
    </svg>
  )
}
