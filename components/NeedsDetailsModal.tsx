
import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { JobCard } from './JobCard';
import { XIcon, RepairIcon } from './icons';
import { Job } from '../types';
import { TAG_KEYWORDS } from '../constants';

interface NeedsDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const NeedsDetailsModal: React.FC<NeedsDetailsModalProps> = ({ isOpen, onClose }) => {
    const { 
        appState, 
        handleJobDragEnd, 
        handleUpdateJob, 
        handleRemoveJob,
        setDraggedJob
    } = useAppContext();

    const countTags = (job: Job) => {
        const notes = (job.notes || '').toLowerCase();
        let count = 0;
        // Check keywords (Tile, Shingle, etc)
        TAG_KEYWORDS.forEach(tag => {
            if (new RegExp(`\\b${tag.toLowerCase()}\\b`).test(notes)) count++;
        });
        // Check numeric patterns
        if (/\b\d+\s*sq/i.test(notes)) count++; // sqft
        if (/\b\d+\s*yrs\b/i.test(notes)) count++; // age
        if (/\b\d+S\b/i.test(notes)) count++; // stories
        return count;
    };

    const jobsNeedingDetails = useMemo(() => {
        // Filter from Unassigned Jobs
        return appState.unassignedJobs.filter(job => countTags(job) <= 1);
    }, [appState.unassignedJobs]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="px-6 py-4 border-b flex justify-between items-center bg-amber-50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-lg border border-amber-200 shadow-sm">
                            <RepairIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Jobs Needing Details</h2>
                            <p className="text-xs text-gray-600">
                                Found {jobsNeedingDetails.length} jobs with missing information (Age, Size, Type).
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition">
                        <XIcon className="h-6 w-6" />
                    </button>
                </header>

                <div className="bg-white p-4 border-b border-gray-100">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        These jobs have <b>1 or fewer</b> data tags. Updating them with details like 
                        <i> "20yrs", "2500sqft", "Tile"</i> will improve the AI Auto-Assign score. 
                        Click a card to edit.
                    </p>
                </div>

                <div className="flex-grow overflow-y-auto bg-gray-50 p-4 custom-scrollbar">
                    {jobsNeedingDetails.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {jobsNeedingDetails.map(job => (
                                <JobCard 
                                    key={job.id}
                                    job={job}
                                    onDragStart={setDraggedJob}
                                    onDragEnd={handleJobDragEnd}
                                    onUpdateJob={handleUpdateJob}
                                    onRemove={handleRemoveJob}
                                    isCompact={false}
                                    isDraggable={false} // Disable drag in modal to focus on editing
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center pb-10">
                            <div className="p-4 bg-green-50 rounded-full mb-3">
                                <RepairIcon className="h-12 w-12 text-green-400" />
                            </div>
                            <p className="text-lg font-semibold text-gray-700">All Clear!</p>
                            <p className="text-sm mt-1">No sparse jobs found in the unassigned list.</p>
                        </div>
                    )}
                </div>
                
                <footer className="px-6 py-3 bg-gray-50 border-t flex justify-end rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition shadow-sm">
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default NeedsDetailsModal;
