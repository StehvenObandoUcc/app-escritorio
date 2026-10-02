/** Avatar con iniciales. La foto de perfil llega en una fase posterior (CU-05). */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      role="img"
      aria-label={name}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text"
    >
      {initials}
    </span>
  );
}
