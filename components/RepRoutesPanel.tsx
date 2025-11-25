import React, { useMemo } from 'react';
import { DisplayJob } from '../types';
import RepRouteCard from './RepRouteCard';

interface RepRoutesPanelProps {
    jobs: DisplayJob[];
}

const RepRoutesPanel: React.FC<RepRoutesPanelProps> = ({ jobs }) => {
    const jobsByRep = useMemo(() => {
        return jobs.reduce((acc, job) => {
            const repName = job.assignedRepName;
            if (repName) {
                if (!acc[repName]) {
                    acc[repName] = [];
                }
                acc[repName].push(job);
            }
            return acc;
        }, {} as Record<string, DisplayJob[]>);
    }, [jobs]);

    const sortedRepNames = useMemo(() => Object.keys(jobsByRep).sort(), [jobsByRep]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex-grow bg-gray-50 rounded-lg overflow-y-auto">
                {sortedRepNames.length > 0 ? (
                    <div className="space-y-4 p-1">
                        {sortedRepNames.map(repName => (
                            <RepRouteCard key={repName} repName={repName} jobs={jobsByRep[repName]} />
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-center text-gray-500">
                        <div>
                            <p className="font-semibold">No Routes to Display</p>
                            <p className="text-sm mt-1">Assign jobs to reps to see their routes here.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RepRoutesPanel;
