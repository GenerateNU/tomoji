// Bun bundles next/image's CommonJS entry as a module object, so browser
// fixtures render a plain <img> with the layout Next.js applies for `fill`.
export default function Image({
  src,
  alt,
  fill,
  sizes,
  className,
}: {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- test stand-in for next/image
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      className={className}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined}
    />
  );
}
