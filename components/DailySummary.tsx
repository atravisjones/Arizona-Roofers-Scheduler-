import React, { useMemo, useRef, useState } from 'react';
import { DisplayJob, Job } from '../types';
import { TAG_KEYWORDS } from '../constants';
import { ClipboardIcon } from './icons';
import { useAppContext } from '../context/AppContext';
import { GREATER_PHOENIX_CITIES, NORTHERN_AZ_CITIES, SOUTHERN_AZ_CITIES, SOUTH_OUTER_RING_CITIES } from '../services/geography';

// Helper to extract job type and clean up notes for display
const getJobDisplayDetails = (job: Job | DisplayJob) => {
    const notesLower = job.notes.toLowerCase();
    const foundTags = TAG_KEYWORDS.filter(keyword => {
        const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`);
        return regex.test(notesLower);
    });

    const jobType = foundTags.length > 0 ? foundTags.join('/') : 'Inspection';
    
    const isGoldJob = job.notes.includes('#');
    const priorityReasonMatch = job.notes.match(/#\s*\(([^)]+)\)/);
    const priorityReason = priorityReasonMatch ? `(${priorityReasonMatch[1]})` : '';

    const ageMatch = job.notes.match(/\b(\d+\s*yrs)\b/i);
    const roofAge = ageMatch ? ageMatch[0] : null;

    const sqftMatch = job.notes.match(/\b(\d+)\s*sq\.?\b/i);
    const sqft = sqftMatch ? `${sqftMatch[1]}sqft` : null;

    const storiesMatch = job.notes.match(/\b(\d)S\b/i);
    const stories = storiesMatch ? `${storiesMatch[1]} Story` : null;


    // Extract reschedule info
    const rescheduleRegex = /\(Recommended Reschedule from ([^)]+)\)/i;
    const rescheduleMatch = job.notes.match(rescheduleRegex);
    const rescheduleInfo = rescheduleMatch ? rescheduleMatch[1] : null;

    // Remove tags and boilerplate text to get clean, human-readable notes
    let cleanNotes = job.notes;
    foundTags.forEach(tag => {
        cleanNotes = cleanNotes.replace(new RegExp(`\\b${tag}\\b`, 'ig'), '').trim();
    });
    cleanNotes = cleanNotes
        .replace(/\(Recommended Reschedule from [^)]+\)/gi, '')
        .replace(/\(Scheduled: [^)]+\)/gi, '')
        .replace(/\(\s*\)/g, '') // remove empty parentheses
        .replace(/^[-,.\s]+|[-,.\s]+$/g, '') // trim lingering separators
        .trim();

    return { jobType, cleanNotes, rescheduleInfo, isGoldJob, priorityReason, roofAge, sqft, stories };
};

// Helper to shorten time label for the table
const shortenTimeLabel = (label: string) => {
    return label
        .replace(/am/gi, '')
        .replace(/pm/gi, '')
        .replace(/\s*-\s*/g, '–') // en-dash
        .trim();
};

// Helper to determine region bucket for stats
const getRegionBucket = (city: string) => {
    const c = city.toLowerCase().trim();
    if (SOUTHERN_AZ_CITIES.has(c)) return 'Tucson';
    if (NORTHERN_AZ_CITIES.has(c)) return 'Northern';
    if (SOUTH_OUTER_RING_CITIES.has(c)) return 'Outer Cities'; 
    // Fallback: if it's in general Phoenix list but not outer ring
    if (GREATER_PHOENIX_CITIES.has(c)) return 'Valley';
    // Default fallback
    return 'Valley';
};

interface DailySummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const DailySummaryModal: React.FC<DailySummaryModalProps> = ({ isOpen, onClose }) => {
    const { assignedJobs: jobs, appState, selectedDate } = useAppContext();
    const summaryRef = useRef<HTMLDivElement>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    
    const formattedDate = selectedDate.toLocaleDateString('en-US');
    // Updated to Plural "Appointments"
    const subjectLine = `Appointments Summary ${formattedDate}`;

    // 1. Existing Detailed List Logic (Group by Time Slot)
    const jobsByTimeSlot = useMemo<Record<string, DisplayJob[]>>(() => {
        const assignedJobs = jobs.filter(j => j.assignedRepName);

        const grouped = assignedJobs.reduce((acc, job) => {
            // Use original timeframe for sorting/grouping if possible to match customer expectations
            const slot = job.originalTimeframe || job.timeSlotLabel || 'Uncategorized';
            if (!acc[slot]) acc[slot] = [];
            acc[slot].push(job);
            return acc;
        }, {} as Record<string, DisplayJob[]>);
        
        const getSortableTime = (timeString: string): number => {
            if (!timeString || timeString === 'Uncategorized') return 99;
            const timePart = timeString.split('-')[0].trim();
            const match = timePart.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);

            if (!match) return 99;

            let hour = parseInt(match[1], 10);
            const minutes = match[2] ? parseInt(match[2], 10) : 0;
            const period = match[3] ? match[3].toLowerCase() : null;
            
            if (period === 'pm' && hour < 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            
            // Heuristic for missing am/pm if early morning
            if (!period && hour >= 1 && hour <= 6) hour += 12;

            return hour + (minutes / 60);
        };
        
        const sortedSlots = Object.keys(grouped).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            const aStart = getSortableTime(a);
            const bStart = getSortableTime(b);
            return aStart - bStart;
        });

        const finalGrouped: Record<string, DisplayJob[]> = {};
        for (const slot of sortedSlots) {
            finalGrouped[slot] = grouped[slot];
        }
        return finalGrouped;
    }, [jobs]);

    // 2. New Logic: Stats & Overview Table
    const { overviewData, stats } = useMemo(() => {
        const currentStats = {
            total: 0,
            valley: 0,
            outer: 0,
            tucson: 0,
            northern: 0,
        };

        const data = appState.reps
            .map(rep => {
                // Get all jobs for this rep in order of time slots
                const repJobs = rep.schedule.flatMap(slot => 
                    slot.jobs.map(j => ({ ...j, timeSlotLabel: slot.label }))
                );
                
                if (repJobs.length === 0) return null;

                // Update stats
                currentStats.total += repJobs.length;
                repJobs.forEach(j => {
                    const region = getRegionBucket(j.city || '');
                    if (region === 'Valley') currentStats.valley++;
                    else if (region === 'Outer Cities') currentStats.outer++;
                    else if (region === 'Tucson') currentStats.tucson++;
                    else if (region === 'Northern') currentStats.northern++;
                    else currentStats.valley++; // Default to valley for misc
                });

                // Format Cities
                const cities = repJobs.map(j => j.city || 'Unknown');
                const uniqueCities = Array.from(new Set(cities));
                let citiesDisplay = '';
                
                if (uniqueCities.length === 1) {
                    citiesDisplay = `${uniqueCities[0]} (×${cities.length})`;
                } else {
                    // List in order
                    citiesDisplay = cities.join(', ');
                }

                // Format Time Blocks - Prioritize Original Request
                const timeBlocks = repJobs.map(j => shortenTimeLabel(j.originalTimeframe || j.timeSlotLabel || ''));
                const timeBlocksDisplay = timeBlocks.join(', ');

                return {
                    name: rep.name,
                    count: repJobs.length,
                    cities: citiesDisplay,
                    timeBlocks: timeBlocksDisplay
                };
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);

        // Sort by total count descending for the table
        data.sort((a, b) => b.count - a.count);

        return { overviewData: data, stats: currentStats };
    }, [appState.reps]);


    const handleCopy = () => {
        if (summaryRef.current) {
            const range = document.createRange();
            range.selectNode(summaryRef.current);
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
                try {
                    document.execCommand('copy');
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2500);
                } catch (err) {
                    console.error('Failed to copy text: ', err);
                    alert('Could not copy text. Please check browser permissions.');
                }
                selection.removeAllRanges();
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b flex justify-between items-center flex-shrink-0 bg-gray-50 rounded-t-xl">
                    <h2 className="text-lg font-bold text-gray-800">Daily Job Summary</h2>
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={handleCopy}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 ${copySuccess ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                            disabled={jobs.length === 0}
                        >
                            <ClipboardIcon />
                            <span>{copySuccess ? 'Copied!' : 'Copy for Email'}</span>
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-3xl leading-none">&times;</button>
                    </div>
                </header>
                <div className="flex-grow bg-white text-gray-800 p-8 overflow-y-auto font-sans">
                    <div ref={summaryRef} className="space-y-8">
                        
                        {/* 1. Email Subject & Header */}
                        <div className="mb-6">
                            <div className="bg-gray-100 p-3 rounded-md mb-4 border border-gray-200">
                                <p className="font-mono text-sm text-gray-700 select-all">
                                    <span className="font-bold text-gray-900">Email Subject:</span> {subjectLine}
                                </p>
                            </div>

                            <div className="text-center">
                                <h1 className="text-xl font-bold text-green-800 mb-4 uppercase">{subjectLine}</h1>
                                <div className="text-left inline-block">
                                    <p>Total Appointments: {stats.total}</p>
                                    <p>Valley: {stats.valley}</p>
                                    <p>Outer Cities: {stats.outer}</p>
                                    <p>Tucson: {stats.tucson}</p>
                                    <p>Northern: {stats.northern}</p>
                                </div>
                            </div>
                        </div>
                        
                        <hr className="border-gray-300" />

                        {/* 2. Overview Table */}
                        <div>
                            <h2 className="text-xl font-bold mb-3">2. Overview Table</h2>
                            <table className="min-w-full border-collapse border border-black text-sm text-black">
                                <thead>
                                    <tr className="bg-white">
                                        <th className="border border-black px-2 py-1 text-left font-bold text-black w-40">Rep</th>
                                        <th className="border border-black px-2 py-1 text-left font-bold text-black w-16">Total</th>
                                        <th className="border border-black px-2 py-1 text-left font-bold text-black">Cities</th>
                                        <th className="border border-black px-2 py-1 text-left font-bold text-black w-64">Time Blocks (Original)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {overviewData.map((row, idx) => (
                                        <tr key={row.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-100'}>
                                            <td className="border border-black px-2 py-1 font-bold text-black">{row.name}</td>
                                            <td className="border border-black px-2 py-1 text-black">{row.count}</td>
                                            <td className="border border-black px-2 py-1 text-black">{row.cities}</td>
                                            <td className="border border-black px-2 py-1 text-black">{row.timeBlocks}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <hr className="border-gray-300" />

                        {/* 3. Detailed Schedule */}
                        <div>
                            {Object.keys(jobsByTimeSlot).length > 0 ? (
                                Object.keys(jobsByTimeSlot).map((timeSlot) => {
                                    const jobsInSlot = jobsByTimeSlot[timeSlot];
                                    return (
                                        <div key={timeSlot} className="mb-6">
                                            <h3 className="text-lg font-mono font-bold text-gray-900 mb-2">
                                                {timeSlot} ({jobsInSlot.length})
                                            </h3>
                                            <ul className="list-disc list-inside space-y-1 font-mono text-sm">
                                                {jobsInSlot.map(job => {
                                                    const { jobType, rescheduleInfo, isGoldJob, priorityReason, roofAge, sqft, stories } = getJobDisplayDetails(job);
                                                    const locationDisplay = [job.city ? job.city.toUpperCase() : '', job.zipCode ? `AZ ${job.zipCode}` : null].filter(Boolean).join(', ');
                                                    const tags = [roofAge, jobType, sqft, stories].filter(Boolean).join(' ');
                                                    
                                                    return (
                                                        <li key={job.id}>
                                                            <span className="uppercase">{locationDisplay}</span>
                                                            {' '}(<strong className="text-gray-900 font-bold">{tags}</strong>)
                                                            {isGoldJob && <span className="text-yellow-600 font-bold ml-1"># {priorityReason}</span>}
                                                            {rescheduleInfo && <span className="text-blue-600 italic ml-1">(Rescheduled from {rescheduleInfo})</span>}
                                                            {' '}→ {job.assignedRepName}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-gray-500 italic">No assigned jobs.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DailySummaryModal;