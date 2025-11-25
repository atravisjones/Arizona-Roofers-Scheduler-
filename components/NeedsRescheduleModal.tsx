import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { XIcon, RescheduleIcon, ClipboardIcon } from './icons';
import { Rep, DisplayJob } from '../types';

interface NeedsRescheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Helper function to check for non-overlapping times
const parseTimeRange = (timeStr: string | undefined): { start: number, end: number } | null => {
    if (!timeStr) return null;
    const parts = timeStr.split('-').map(s => s.trim());
    
    const parseTime = (t: string) => {
        const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!match) return 0;
        let h = parseInt(match[1]);
        const m = parseInt(match[2] || '0');
        const p = match[3]?.toLowerCase();
        if (p === 'pm' && h < 12) h += 12;
        if (p === 'am' && h === 12) h = 0;
        if (!p && h >= 1 && h <= 6) h += 12;
        return h * 60 + m;
    };

    if (parts.length >= 2) {
        return { start: parseTime(parts[0]), end: parseTime(parts[1]) };
    }
    return null;
};

const doTimesOverlap = (t1: string | undefined, t2: string | undefined): boolean => {
    const r1 = parseTimeRange(t1);
    const r2 = parseTimeRange(t2);
    if (!r1 || !r2) return true; // Assume overlap if parsing fails to avoid false positives
    return r1.start < r2.end && r2.start < r1.end;
};


const NeedsRescheduleModal: React.FC<NeedsRescheduleModalProps> = ({ isOpen, onClose }) => {
    const { appState, handleUpdateJob } = useAppContext();
    const [copySuccess, setCopySuccess] = useState<{ id: string; type: 'agreed' | 'voicemail' | 'text' } | null>(null);

    const jobsNeedingReschedule = useMemo(() => {
        const results: Array<{ rep: Rep; job: DisplayJob; reason: 'Mismatch' | 'Optimized' }> = [];
        const seenJobIds = new Set<string>();

        appState.reps.forEach(rep => {
            rep.schedule.forEach(slot => {
                slot.jobs.forEach(job => {
                    // Optimized jobs have `timeSlotLabel` on the job object. Manual jobs use the slot's label.
                    const scheduledTimeLabel = job.timeSlotLabel || slot.label;
                    
                    if (job.originalTimeframe && scheduledTimeLabel) {
                        const overlaps = doTimesOverlap(job.originalTimeframe, scheduledTimeLabel);
                        if (!overlaps && !seenJobIds.has(job.id)) {
                            // The reason is based on whether the rep's schedule was optimized.
                            const reason = rep.isOptimized ? 'Optimized' : 'Mismatch';
                            results.push({ rep, job: { ...job, timeSlotLabel: scheduledTimeLabel }, reason });
                            seenJobIds.add(job.id);
                        }
                    }
                });
            });
        });
        return results;
    }, [appState.reps]);

    const jobsByRep = useMemo(() => {
        return jobsNeedingReschedule.reduce((acc, { rep, job, reason }) => {
            if (!acc[rep.id]) {
                acc[rep.id] = {
                    repName: rep.name,
                    isOptimized: rep.isOptimized,
                    jobs: []
                };
            }
            acc[rep.id].jobs.push({ job, reason });
            return acc;
        }, {} as Record<string, { repName: string; isOptimized: boolean | undefined; jobs: { job: DisplayJob; reason: 'Mismatch' | 'Optimized' }[] }>);
    }, [jobsNeedingReschedule]);

    const handleConfirmReschedule = (job: DisplayJob) => {
        if (job.timeSlotLabel) {
            // Update originalTimeframe to the new confirmed time, which removes it from this list
            handleUpdateJob(job.id, { originalTimeframe: job.timeSlotLabel });
        }
    };

    const handleCopyNote = (job: DisplayJob, type: 'agreed' | 'voicemail') => {
        const originalTime = job.originalTimeframe || 'N/A';
        const newTime = job.timeSlotLabel || 'N/A';
        const message = type === 'agreed'
            ? `Called to reschedule from ${originalTime} to optimized time ${newTime}. Customer agreed to reschedule.`
            : `Called to reschedule from ${originalTime} to optimized time ${newTime}. Left voicemail about reschedule.`;

        navigator.clipboard.writeText(message).then(() => {
            setCopySuccess({ id: job.id, type });
            setTimeout(() => setCopySuccess(null), 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert('Could not copy text.');
        });
    };

    const handleCopyTextEmail = (job: DisplayJob) => {
        const customerName = job.customerName; // This is the city, but it's what's available
        const originalTime = job.originalTimeframe || 'your originally requested time';
        const newTime = job.timeSlotLabel || 'the new proposed time';
        const message = `Hi ${customerName},\n\nDue to a scheduling conflict, we've updated your arrival window for tomorrow to ${newTime}. Your original request was for ${originalTime}. Please let us know if this new time works for you. Thank you!`;
        
        navigator.clipboard.writeText(message).then(() => {
            setCopySuccess({ id: job.id, type: 'text' });
            setTimeout(() => setCopySuccess(null), 2000);
        }).catch(err => {
            alert('Could not copy text.');
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="px-6 py-4 border-b flex justify-between items-center bg-blue-50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg border border-blue-200 shadow-sm">
                            <RescheduleIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Needs Reschedule</h2>
                            <p className="text-xs text-gray-600">
                                Found {jobsNeedingReschedule.length} jobs with potential scheduling conflicts.
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition">
                        <XIcon className="h-6 w-6" />
                    </button>
                </header>

                <div className="bg-white p-4 border-b border-gray-100">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        This list includes any job scheduled at a time that does not overlap with its original request. Check the box to confirm the change and remove it from this list.
                    </p>
                </div>

                <div className="flex-grow overflow-y-auto bg-gray-50 p-4 custom-scrollbar">
                    {Object.keys(jobsByRep).length > 0 ? (
                        <div className="space-y-4">
                            {Object.values(jobsByRep).map(({ repName, isOptimized, jobs }) => (
                                <div key={repName} className="bg-white border border-gray-200 rounded-lg shadow-sm">
                                    <h3 className="text-base font-bold text-gray-800 px-4 py-2 border-b flex items-center gap-2">
                                        {repName}
                                        {isOptimized && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">Optimized</span>}
                                    </h3>
                                    <ul className="divide-y divide-gray-100">
                                        {jobs.map(({ job, reason }) => (
                                            <li key={job.id} className="p-4 transition-colors">
                                                <div className="grid grid-cols-[auto,1fr,auto] gap-4 items-center">
                                                    {/* Checkbox */}
                                                    <div className="flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            onChange={() => handleConfirmReschedule(job)}
                                                            className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                            aria-label={`Confirm reschedule for job at ${job.address}`}
                                                            title="Confirm reschedule. This will update the job and remove it from this list."
                                                        />
                                                    </div>

                                                    {/* Job Info */}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-800">{job.city}</p>
                                                                <p className="text-xs text-gray-500 truncate">{job.address}</p>
                                                            </div>
                                                            <span className={`ml-4 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                                                reason === 'Mismatch' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-teal-100 text-teal-800 border-teal-200'
                                                            }`}>
                                                                {reason}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 text-xs flex gap-4">
                                                            <p>Original: <span className="font-semibold">{job.originalTimeframe || 'N/A'}</span></p>
                                                            <p className="text-blue-600">Scheduled: <span className="font-bold">{job.timeSlotLabel || 'N/A'}</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Copy Actions */}
                                                    <div className="flex flex-col gap-2 w-36">
                                                        <button
                                                            onClick={() => handleCopyTextEmail(job)}
                                                            className={`flex items-center justify-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-md border text-gray-600 bg-white hover:bg-gray-50 transition shadow-sm w-full ${copySuccess?.id === job.id && copySuccess.type === 'text' ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                                                        >
                                                             <ClipboardIcon className="h-3 w-3" />
                                                            {copySuccess?.id === job.id && copySuccess.type === 'text' ? 'Copied!' : 'Copy Text/Email'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleCopyNote(job, 'agreed')}
                                                            className={`flex items-center justify-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-md border text-gray-600 bg-white hover:bg-gray-50 transition shadow-sm w-full ${copySuccess?.id === job.id && copySuccess.type === 'agreed' ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                                                        >
                                                             <ClipboardIcon className="h-3 w-3" />
                                                            {copySuccess?.id === job.id && copySuccess.type === 'agreed' ? 'Copied!' : 'Copy "Agreed"'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleCopyNote(job, 'voicemail')}
                                                            className={`flex items-center justify-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-md border text-gray-600 bg-white hover:bg-gray-50 transition shadow-sm w-full ${copySuccess?.id === job.id && copySuccess.type === 'voicemail' ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                                                        >
                                                            <ClipboardIcon className="h-3 w-3" />
                                                            {copySuccess?.id === job.id && copySuccess.type === 'voicemail' ? 'Copied!' : 'Copy "Voicemail"'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    ) : (
                         <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center pb-10">
                            <div className="p-4 bg-green-50 rounded-full mb-3">
                                <RescheduleIcon className="h-12 w-12 text-green-400" />
                            </div>
                            <p className="text-lg font-semibold text-gray-700">All Good!</p>
                            <p className="text-sm mt-1">No jobs with time conflicts were found.</p>
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

export default NeedsRescheduleModal;