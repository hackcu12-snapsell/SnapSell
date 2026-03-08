/** @module CardHeader.tsx */

import React from "react";
import Button, { type ButtonVariant } from "../Button/Button";

import "./CardHeader.css";

export interface CardHeaderButton {
  text: string;
  onClick?: () => void;
  variant?: ButtonVariant;
}

export interface CardHeaderProps {
  text: string;
  buttons?: CardHeaderButton[];
}

const CardHeader: React.FC<CardHeaderProps> = ({ text, buttons }) => {
  return (
    <div className="card-header">
      <div className="header-text">{text}</div>
      <div className="header-buttons">
        {(buttons ?? []).map(({ text, onClick, variant }, index) => (
          <Button key={index} variant={variant} onClick={onClick}>
            {text}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default CardHeader;
