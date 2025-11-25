import React, { useMemo } from 'react';
import { DisplayJob } from '../types';
import { TAG_KEYWORDS } from '../constants';
import { UserIcon, UnassignJobIcon } from './icons';

// Helper to get job tags
const getJobTags = (job: DisplayJob): string => {
  if (!job.notes) return '';
  const notesLower = job.notes.toLowerCase();
  const found = TAG_KEYWORDS.filter(keyword => new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower));
  return found.join(', ') || '';
};

interface JobListProps {
  jobs: DisplayJob[];
  onUnassign: (jobId: string) => void;
}

const JobList: React.FC<JobListProps> = ({ jobs, onUnassign }) => {
  const jobsByTimeSlot = useMemo<Record<string, DisplayJob[]>>(() => {
    const grouped = jobs.reduce((acc, job) => {
      const slot = job.timeSlotLabel || 'Uncategorized';
      if (!acc[slot]) {
        acc[slot] = [];
      }
      acc[slot].push(job);
      return acc;
    }, {} as Record<string, DisplayJob[]>);

    // Function to get a sortable 24-hour format hour
    const getSortableHour = (timeString: string): number => {
        const match = timeString.match(/^(\d{1,2})/);
        if (!match) return 99; // Should handle 'Uncategorized' correctly
        let hour = parseInt(match[1], 10);
        // If hour is between 1 and 7, assume it's PM for sorting purposes
        if (hour >= 1 && hour <= 7) {
            hour += 12;
        }
        return hour;
    };

    // Sort time slots logically
    const sortedSlots = Object.keys(grouped).sort((a, b) => {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        const aStart = getSortableHour(a);
        const bStart = getSortableHour(b);
        return aStart - bStart;
    });

    const finalGrouped: Record<string, DisplayJob[]> = {};
    for (const slot of sortedSlots) {
        finalGrouped[slot] = grouped[slot];
    }
    return finalGrouped;

  }, [jobs]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-grow bg-gray-800 text-gray-200 rounded-lg p-4 overflow-y-auto">
        {Object.keys(jobsByTimeSlot).length > 0 ? (
          Object.keys(jobsByTimeSlot).map((timeSlot) => {
            const jobsInSlot = jobsByTimeSlot[timeSlot];
            return (
              <div key={timeSlot} className="mb-4 last:mb-0">
                <h3 className="text-lg font-bold text-white border-b border-gray-700 pb-1 mb-2">
                  {timeSlot} <span className="text-gray-400 font-normal">({jobsInSlot.length} Jobs)</span>
                </h3>
                <div className="space-y-1">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-4 px-2 py-1 text-xs font-bold text-gray-400 uppercase">
                    <div className="col-span-2">City</div>
                    <div className="col-span-3">Address</div>
                    <div className="col-span-3">Type / Notes</div>
                    <div className="col-span-4">Assigned Rep</div>
                  </div>
                  {/* Rows */}
                  {jobsInSlot.map(job => (
                    <div key={job.id} className="grid grid-cols-12 gap-4 items-center px-2 py-2 bg-gray-900/50 rounded-md hover:bg-gray-700/50 transition-colors">
                      <div className="col-span-2 text-sm font-semibold truncate">{job.city || 'N/A'}</div>
                      <div className="col-span-3 text-sm text-gray-300 truncate">{job.address}</div>
                      <div className="col-span-3 text-sm text-gray-400 truncate italic">"{getJobTags(job) || job.notes}"</div>
                      <div className="col-span-4 text-sm font-medium">
                        {job.assignedRepName ? (
                          <div className="flex items-center justify-between">
                              <div className="flex items-center min-w-0">
                                  <UserIcon /> 
                                  <span className="ml-2 truncate">{job.assignedRepName}</span>
                              </div>
                              <button
                                  onClick={() => onUnassign(job.id)}
                                  className="p-1 rounded-full text-gray-400 hover:bg-gray-600 hover:text-white transition flex-shrink-0"
                                  title="Unassign Job"
                              >
                                  <UnassignJobIcon className="h-4 w-4" />
                              </button>
                          </div>
                        ) : (
                          <span className="text-gray-500">Unassigned</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No jobs to display for the selected day.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobList;