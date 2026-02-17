import React from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  title: string;
  content: string;
  link?: string;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, content, link }) => {
  return (
    <div className="help-tooltip-container">
      <span className="tooltip-icon" title={title}>
        <HelpCircle size={16} />
      </span>
      <div className="tooltip-content">
        <h4>{title}</h4>
        <p>{content}</p>
        {link && (
          <a href={link} className="tooltip-link">
            Learn more →
          </a>
        )}
      </div>
    </div>
  );
};

export default HelpTooltip;
