
import React, { useState, useMemo } from 'react';
import { Job } from '../types';
import { JobCard } from './JobCard';
import { ChevronDownIcon, ChevronUpIcon, MapPinIcon, ClipboardIcon } from './icons';
import { useAppContext } from '../context/AppContext';

interface UnassignedJobsProps {
  jobs: Job[];
  onJobDrop: (jobId: string, target: 'unassigned') => void;
  onSetDraggedOverRepId: (id: string | null) => void;
  onJobDragStart: (job: Job) => void;
  onJobDragEnd: () => void;
  onUpdateJob: (jobId: string, updatedDetails: Pick<Job, 'customerName' | 'address' | 'notes'>) => void;
  onRemoveJob: (jobId: string) => void;
  onShowOnMap: () => void;
}

const CityGroup: React.FC<{ city: string; jobs: Job[], onJobDragStart: (job: Job) => void, onJobDragEnd: () => void, onUpdateJob: UnassignedJobsProps['onUpdateJob'], onRemoveJob: UnassignedJobsProps['onRemoveJob'] }> = ({ city, jobs, onJobDragStart, onJobDragEnd, onUpdateJob, onRemoveJob }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-gray-100/50 rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex justify-between items-center text-left p-2 rounded-lg hover:bg-gray-200/50 transition"
      >
        <h4 className="font-bold text-gray-700">{city} <span className="font-normal text-gray-500">({jobs.length})</span></h4>
        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </button>
      {isExpanded && (
        <div className="p-2 space-y-2 border-t border-gray-200">
          {jobs.map(job => <JobCard key={job.id} job={job} onDragStart={onJobDragStart} onDragEnd={onJobDragEnd} onUpdateJob={onUpdateJob} onRemove={onRemoveJob} />)}
        </div>
      )}
    </div>
  )
}


const UnassignedJobs: React.FC<UnassignedJobsProps> = ({ jobs, onJobDrop, onSetDraggedOverRepId, onJobDragStart, onJobDragEnd, onUpdateJob, onRemoveJob, onShowOnMap }) => {
  const [isOver, setIsOver] = useState(false);
  const { draggedJob } = useAppContext();

  const jobsByCity = useMemo(() => {
    return jobs.reduce((acc, job) => {
      const city = job.city || 'Misc.';
      if (!acc[city]) {
        acc[city] = [];
      }
      acc[city].push(job);
      return acc;
    }, {} as Record<string, Job[]>);
  }, [jobs]);

  const sortedCities = useMemo(() => {
    return Object.keys(jobsByCity).sort((a, b) => {
      if (a === 'Misc.') return 1; // Always put Misc. last
      if (b === 'Misc.') return -1;
      return a.localeCompare(b);
    });
  }, [jobsByCity]);

  const googleMapsUrl = useMemo(() => {
    if (!jobs || jobs.length === 0) return '#';
    const addresses = jobs.map(j => j.address);
    if (addresses.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
    }
    const encoded = addresses.map(addr => encodeURIComponent(addr));
    return `https://www.google.com/maps/dir/${encoded.slice(0, 25).join('/')}`;
}, [jobs]);


  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onSetDraggedOverRepId(null); // Signal that we are over the unassigned area, not a rep.
    
    // Only highlight if the dragged job is from another panel (i.e., a rep's schedule)
    const isFromAnotherPanel = draggedJob && !jobs.some(job => job.id === draggedJob.id);
    setIsOver(!!isFromAnotherPanel);
  };
  
  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    const jobId = draggedJob?.id;
    if (jobId) {
      onJobDrop(jobId, 'unassigned');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-base font-semibold text-gray-800">Unassigned Jobs ({jobs.length})</h3>
        <div className="flex items-center space-x-2">
            <button
                onClick={onShowOnMap}
                disabled={jobs.length === 0}
                className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${jobs.length === 0 ? 'bg-gray-400 text-white cursor-not-allowed opacity-70' : 'bg-teal-500 text-white hover:bg-teal-600'}`}
                title="Show all unassigned jobs on the app map"
            >
                <MapPinIcon className="h-4 w-4" />
                <span>Show on Map</span>
            </button>
            <a 
                href={googleMapsUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${jobs.length === 0 ? 'bg-gray-400 text-white cursor-not-allowed opacity-70' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                onClick={(e) => jobs.length === 0 && e.preventDefault()}
                title="Open a multi-stop route in Google Maps (External)"
            >
                <ClipboardIcon className="h-4 w-4" />
                <span>Google Maps</span>
            </a>
        </div>
      </div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-grow p-3 bg-gray-50 rounded-lg border-2 border-dashed transition-colors overflow-y-auto ${isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
      >
        {jobs.length > 0 ? (
          <div className="space-y-3">
            {sortedCities.map(city => (
              <CityGroup key={city} city={city} jobs={jobsByCity[city]} onJobDragStart={onJobDragStart} onJobDragEnd={onJobDragEnd} onUpdateJob={onUpdateJob} onRemoveJob={onRemoveJob} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No unassigned jobs. Paste and process jobs to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnassignedJobs;
