import React from "react";
import { Button as MuiButton } from "@mui/material";
import { motion, AnimatePresence, type Variants } from "framer-motion";

export type ButtonVariant = "contained" | "outlined" | "accent";

export interface ButtonProps {
  children: React.ReactNode;
  hasShadow?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  variant?: ButtonVariant;
}

// Create motion-enabled MUI button once (not per render)
const MotionButton = motion(MuiButton);

const Button: React.FC<ButtonProps> = ({
  children,
  hasShadow = false,
  onClick,
  variant = "contained"
}) => {
  const [isPressed, setIsPressed] = React.useState(false);

  const buttonVariants: Variants = {
    initial: {
      scale: 1,
      boxShadow: hasShadow ? "0px 2px 4px rgba(0, 0, 0, 0.1)" : "none"
    },
    hover: {
      scale: 1.03,
      boxShadow: hasShadow ? "0px 4px 8px rgba(0, 0, 0, 0.15)" : "none"
    },
    tap: {
      scale: 0.97,
      boxShadow: "none"
    }
  };

  const textVariants: Variants = {
    initial: { y: 0 },
    hover: { y: -1 },
    tap: { y: 1 }
  };

  const rippleVariants: Variants = {
    initial: {
      opacity: 0.8,
      scale: 0
    },
    animate: {
      opacity: 0,
      scale: 5,
      transition: {
        duration: 0.8,
        ease: "easeOut" as const
      }
    }
  };

  const commonStyles = {
    padding: "0.5rem 1rem",
    borderRadius: "0.5rem",
    transition: "background-color 0.3s",
    textTransform: "none",
    whiteSpace: "nowrap",
    position: "relative",
    overflow: "hidden"
  };

  const containedStyles = {
    ...commonStyles,
    border: "none",
    backgroundColor: "var(--coffee-dark)",
    color: "var(--text-light)",
    "&:hover": {
      backgroundColor: "var(--coffee-medium)"
    }
  };

  const outlinedStyles = {
    ...commonStyles,
    border: "1px solid var(--coffee-cream)",
    backgroundColor: "transparent",
    color: "var(--text-light)",
    "&:hover": {
      backgroundColor: "rgba(230, 210, 181, 0.1)"
    }
  };

  const accentStyles = {
    ...commonStyles,
    border: "none",
    backgroundColor: "var(--coffee-medium)",
    color: "var(--text-light)",
    "&:hover": {
      backgroundColor: "var(--coffee-dark)"
    }
  };

  let buttonStyles = outlinedStyles;

  if (variant === "contained") {
    buttonStyles = containedStyles;
  } else if (variant === "accent") {
    buttonStyles = accentStyles;
  }

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = e => {
    setIsPressed(true);
    setTimeout(() => setIsPressed(false), 800);
    if (onClick) onClick(e);
  };

  return (
    <MotionButton
      onClick={handleClick}
      variant={variant === "accent" ? "contained" : variant}
      disableElevation={!hasShadow}
      sx={buttonStyles}
      initial="initial"
      whileHover="hover"
      whileTap="tap"
      variants={buttonVariants}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <motion.span
        variants={textVariants}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
      >
        {children}
      </motion.span>

      <AnimatePresence>
        {isPressed && (
          <motion.span
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.3)",
              zIndex: 0
            }}
            variants={rippleVariants}
            initial="initial"
            animate="animate"
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </MotionButton>
  );
};

export default Button;
