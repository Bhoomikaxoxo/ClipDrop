import React from 'react';
import { Check } from 'lucide-react';

const TRUST = [
  'Original Quality',
  'Fast Downloads',
  'Private',
  'No Login Required',
];

export default function FeatureGrid() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2.5">
      {TRUST.map(label => (
        <span key={label} className="flex items-center gap-2 text-[13px]"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} strokeWidth={2.5} />
          {label}
        </span>
      ))}
    </div>
  );
}
