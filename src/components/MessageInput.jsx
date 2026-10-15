import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Zone de saisie d'un message : Entrée envoie, Maj + Entrée passe à la ligne.
// Elle s'agrandit avec le texte (5 lignes au plus, puis défile).
const MessageInput = forwardRef(function MessageInput({ value, className = '', ...props }, ref) {
  const el = useRef(null);
  useImperativeHandle(ref, () => el.current);
  useEffect(() => {
    const box = el.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight + 2, 140)}px`;
  }, [value]);
  const onKeyDown = (e) => {
    props.onKeyDown?.(e);
    if (e.defaultPrevented || e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };
  return <textarea ref={el} rows={1} value={value} {...props} onKeyDown={onKeyDown} className={`${className} resize-none`} />;
});

export default MessageInput;
