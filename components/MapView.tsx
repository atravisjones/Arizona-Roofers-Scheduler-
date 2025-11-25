import React from 'react';
import { Job, DisplayJob } from '../types';
import LeafletMap from './LeafletMap';

interface MapViewProps {
  jobs: Job[];
}

const MapView: React.FC<MapViewProps> = ({ jobs }) => {
  const displayJobs: DisplayJob[] = jobs;

  // The map itself is now the primary responsibility. The empty state is handled by the parent.
  return (
    <div className="w-full h-full flex flex-col bg-gray-200">
      <LeafletMap jobs={displayJobs} mapType="unassigned" />
    </div>
  );
};

export default MapView;