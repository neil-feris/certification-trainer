import { useState } from 'react';
import { useDrillStore } from '../../../stores/drillStore';
import { TimedDrillSetup } from './TimedDrillSetup';
import { TimedDrill } from './TimedDrill';

export function DrillHub() {
  const { drillId, isActive, showSummary } = useDrillStore();
  const [showSetup, setShowSetup] = useState(true);

  // If drill is active or showing summary, show the drill view
  if (drillId && (isActive || showSummary)) {
    return <TimedDrill onExit={() => setShowSetup(true)} />;
  }

  // Otherwise show setup
  return <TimedDrillSetup onStart={() => setShowSetup(false)} />;
}
