
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import UnassignedJobs from './UnassignedJobs';
import PasteJobsModal from './PasteJobsModal';
import { LoadingIcon, PasteIcon, AutoAssignIcon, SearchIcon, DragHandleIcon, XIcon, SettingsIcon } from './icons';
import SettingsModal from './SettingsModal';
import FilterTabs from './FilterTabs';
import { Job } from '../types';

interface JobsPanelProps {
    onDragStart: () => void;
    onDragEnd: () => void;
}

const JobsPanel: React.FC<JobsPanelProps> = ({ onDragStart, onDragEnd }) => {
    const { 
        isParsing, parsingError, isAutoAssigning, appState, 
        handleParseJobs, handleAutoAssign,
        handleUpdateJob, handleRemoveJob, isLoadingReps, handleShowUnassignedJobsOnMap, handleJobDrop, 
        setDraggedJob, handleJobDragEnd, setDraggedOverRepId, activeRoute, setFilteredUnassignedJobs
    } = useAppContext();
    
    const [jobSearchTerm, setJobSearchTerm] = useState('');
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [jobsFilteredByTabs, setJobsFilteredByTabs] = useState<Job[]>(appState.unassignedJobs);

    const filteredUnassignedJobs = useMemo(() => {
        let jobsToSearch = jobsFilteredByTabs;

        if (!jobSearchTerm.trim()) {
            return jobsToSearch;
        }

        const lowercasedFilter = jobSearchTerm.toLowerCase();
        return jobsToSearch.filter(job => {
            return (
                job.customerName.toLowerCase().includes(lowercasedFilter) ||
                job.address.toLowerCase().includes(lowercasedFilter) ||
                (job.city || '').toLowerCase().includes(lowercasedFilter) ||
                job.notes.toLowerCase().includes(lowercasedFilter)
            );
        });
    }, [jobsFilteredByTabs, jobSearchTerm]);

    // Push filtered unassigned jobs to context for synchronized map filtering
    useEffect(() => {
        setFilteredUnassignedJobs(filteredUnassignedJobs);
    }, [filteredUnassignedJobs, setFilteredUnassignedJobs]);

    return (
        <>
            <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
                <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    2. Unassigned Jobs
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                        {appState.unassignedJobs.length}
                    </span>
                </h2>
                
                <div className="flex items-center gap-1">
                     <div className="relative group">
                        <input 
                            type="text" 
                            className={`
                                pl-8 pr-7 py-1.5 text-xs border border-gray-300 bg-white rounded-md 
                                focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all w-28 focus:w-48
                                ${jobSearchTerm ? 'w-48' : ''}
                            `}
                            placeholder="Search jobs..." 
                            value={jobSearchTerm} 
                            onChange={e => setJobSearchTerm(e.target.value)} 
                        />
                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400">
                            <SearchIcon className="h-3.5 w-3.5" />
                        </div>
                         {jobSearchTerm && (
                            <button onClick={() => setJobSearchTerm('')} className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer">
                                <XIcon className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    
                    <div className="w-px h-4 bg-gray-200 mx-1"></div>

                     <button 
                        onClick={() => setIsSettingsModalOpen(true)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        title="Assignment Settings"
                    >
                        <SettingsIcon className="h-4 w-4" />
                    </button>
                    
                    <div
                        draggable
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        className="p-1.5 cursor-grab text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-md transition-colors active:cursor-grabbing"
                        title="Drag to reorder column"
                    >
                        <DragHandleIcon className="h-4 w-4" />
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
                 <button 
                    onClick={() => setIsPasteModalOpen(true)} 
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 shadow-sm rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:text-indigo-600 transition-all group"
                >
                    <div className="p-1 bg-indigo-50 text-indigo-600 rounded-md group-hover:bg-indigo-100 transition-colors">
                         <PasteIcon className="h-4 w-4" />
                    </div>
                    <span>Paste Jobs</span>
                </button>

                 <button 
                    onClick={handleAutoAssign} 
                    disabled={isLoadingReps || isAutoAssigning || isParsing || appState.unassignedJobs.length === 0} 
                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 shadow-sm rounded-lg text-sm font-semibold text-white hover:bg-indigo-700 hover:shadow-md disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all"
                    title={isLoadingReps ? "Waiting for rep data to load..." : appState.unassignedJobs.length === 0 ? "No unassigned jobs to assign" : "Automatically assign jobs to available reps"}
                >
                     {isAutoAssigning ? <LoadingIcon /> : <AutoAssignIcon className="h-4 w-4" />}
                    <span>{isAutoAssigning ? 'Assigning...' : 'Auto Assign'}</span>
                </button>
            </div>
            
            <FilterTabs
                unassignedJobs={appState.unassignedJobs}
                onFilterChange={setJobsFilteredByTabs}
            />

            {parsingError && <p className="text-red-500 text-xs my-2 text-center bg-red-50 p-2 rounded-md border border-red-100">{parsingError}</p>}

            <div className="flex-grow overflow-y-auto min-h-0 pt-2 custom-scrollbar">
                <UnassignedJobs 
                    jobs={filteredUnassignedJobs} 
                    onJobDrop={handleJobDrop} 
                    onSetDraggedOverRepId={setDraggedOverRepId} 
                    onJobDragStart={setDraggedJob} 
                    onJobDragEnd={handleJobDragEnd} 
                    onUpdateJob={handleUpdateJob} 
                    onRemoveJob={handleRemoveJob}
                    onShowOnMap={() => handleShowUnassignedJobsOnMap(filteredUnassignedJobs)}
                />
            </div>
            
            <PasteJobsModal
                isOpen={isPasteModalOpen}
                onClose={() => setIsPasteModalOpen(false)}
                onParse={handleParseJobs}
                isParsing={isParsing}
            />

            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
            />
        </>
    );
};

export default JobsPanel;
