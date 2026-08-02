// Textarea sibling of TextField (design node 68:45): same label, box and error
// treatment, taller and free to wrap. Used for the optional run note.
interface TextAreaProps {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export default function TextArea({ id, label, placeholder, value, onChange }: TextAreaProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-secondary">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Shorter on a phone, where 88px of note would push the buttons off
        // screen; see TextField for why the type scales at `sm`.
        className="h-[68px] w-full resize-none rounded-[12px] border border-line-strong bg-white px-[15px] py-[13px] text-[16px] leading-[1.55] text-ink placeholder:text-tertiary sm:h-[88px] sm:text-[15px]"
      />
    </div>
  );
}
