import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

/** Button with physical press feedback. Every tappable surface in the deck uses it. */
export const Press = forwardRef<HTMLButtonElement, HTMLMotionProps<"button">>(function Press(
  { className = "", type = "button", ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.965 }}
      transition={{ type: "spring", stiffness: 700, damping: 35 }}
      className={`select-none outline-none disabled:opacity-40 ${className}`}
      {...rest}
    />
  );
});
