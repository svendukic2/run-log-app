// The four-point sparkle that marks everything AI Coach (sidebar node 47:40,
// coach cards). Fills with currentColor, so the caller colours it with a text
// class on the svg itself.
export default function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M10 0L12.687 7.31299L20 10L12.687 12.687L10 20L7.31299 12.687L0 10L7.31299 7.31299L10 0Z"
        fill="currentColor"
      />
    </svg>
  );
}
