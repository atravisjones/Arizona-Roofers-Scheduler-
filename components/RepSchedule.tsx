import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Rep, Job, DisplayJob } from '../types';
import { ChevronDownIcon, ChevronUpIcon, PinIcon, ClipboardIcon, LockIcon, UnlockIcon, AutoAssignIcon, SwapIcon, OptimizeIcon, UndoIcon, SettingsIcon, TrophyIcon, XIcon, MenuIcon, MessageIcon } from './icons';
import { JobCard } from './JobCard';
import { TAG_KEYWORDS } from '../constants';
import { useAppContext } from '../context/AppContext';
import { mapTimeframeToSlotId } from '../services/geminiService';

interface RepScheduleProps {
  rep: Rep;
  onJobDrop: (jobId: string, target: { repId:string, slotId: string }, e: React.DragEvent<HTMLDivElement>) => void;
  onUnassign: (jobId: string) => void;
  onToggleLock: (repId: string) => void;
  onUpdateJob: (jobId: string, updatedDetails: Pick<Job, 'customerName' | 'address' | 'notes'>) => void;
  onRemoveJob: (jobId: string) => void;
  isSelected: boolean;
  onSelectRep: (e: React.MouseEvent) => void;
  selectedDay: string;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  draggedOverRepId: string | null;
  onSetDraggedOverRepId: (id: string | null) => void;
  onJobDragStart: (job: Job) => void;
  onJobDragEnd: () => void;
  draggedJob: Job | null;
  isInvalidDropTarget?: boolean;
  invalidReason?: string;
  isOverrideActive?: boolean;
  isHighlighted?: boolean;
}

interface DropZoneProps {
  repId: string;
  slotId: string;
  onJobDrop: (jobId: string, target: { repId:string, slotId: string }, e: React.DragEvent<HTMLDivElement>) => void;
  label: string;
  isUnavailable: boolean;
  onJobDragStart: (job: Job) => void;
  onJobDragEnd: () => void;
  draggedJob: Job | null;
  jobs: Job[];
  onUnassign: (jobId: string) => void;
  onUpdateJob: (jobId: string, updatedDetails: Pick<Job, 'customerName' | 'address' | 'notes'>) => void;
  onRemoveJob: (jobId: string) => void;
  isOptimized?: boolean;
}

const parseTimeRange = (timeStr: string | undefined): { start: number, end: number } | null => {
    if (!timeStr) return null;
    // Matches "7:30am", "10am", "7:30am - 9am"
    const parts = timeStr.split('-').map(s => s.trim());
    
    const parseTime = (t: string) => {
        const match = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (!match) return 0;
        let h = parseInt(match[1]);
        const m = parseInt(match[2] || '0');
        const p = match[3]?.toLowerCase();
        if (p === 'pm' && h < 12) h += 12;
        if (p === 'am' && h === 12) h = 0;
        if (!p && h >= 1 && h <= 6) h += 12; // Heuristic
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
    if (!r1 || !r2) return true; 
    return r1.start < r2.end && r2.start < r1.end;
};

const checkTimeMismatch = (originalTimeframe: string | undefined, slotLabel: string): boolean => {
  if (!originalTimeframe) {
    return false;
  }
  const getStartHour = (timeString: string): number | null => {
    const match = timeString.match(/^(\d{1,2})/);
    return match ? parseInt(match[1], 10) : null;
  };
  const jobStartHour = getStartHour(originalTimeframe);
  const slotStartHour = getStartHour(slotLabel);
  return jobStartHour !== null && slotStartHour !== null && jobStartHour !== slotStartHour;
};

const DropZone: React.FC<DropZoneProps> = ({ repId, slotId, onJobDrop, label, isUnavailable, onJobDragStart, onJobDragEnd, draggedJob, jobs, onUnassign, onUpdateJob, onRemoveJob, isOptimized }) => {
  const [isOver, setIsOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOptimized) {
      setIsOver(true);
    } else {
       e.dataTransfer.dropEffect = 'none';
    }
  };
  
  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOptimized) return;
    setIsOver(false);
    const jobId = draggedJob?.id;
    if (jobId) {
      onJobDrop(jobId, { repId, slotId }, e);
    }
  };
  
  const hasJobs = jobs.length > 0;
  const isDoubleBooked = jobs.length > 1;

  if (isUnavailable) {
    return (
        <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mt-1 flex flex-col px-2 py-1.5 rounded-lg bg-gray-100 border-2 border-dashed transition-colors min-w-0 ${isOver ? 'border-red-500 bg-red-100' : hasJobs ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
            <div className="mb-1">
                <h4 className={`font-bold text-[11px] uppercase ${isDoubleBooked ? 'text-red-700' : hasJobs ? 'text-red-700' : 'text-gray-400'}`}>
                    {label} <span className="font-normal text-gray-400 ml-1">(Unavailable)</span>
                    {hasJobs && <span className="ml-1 font-bold text-red-600 text-[10px]">! Mismatch</span>}
                </h4>
            </div>
            <div className={`flex-1 min-w-0 min-h-[24px] ${isDoubleBooked ? 'grid grid-cols-2 gap-2' : 'space-y-1'}`}>
                {jobs.map(job => {
                    const isTimeMismatch = checkTimeMismatch(job.originalTimeframe, label);
                    return <JobCard 
                                key={job.id} 
                                job={job} 
                                isMismatch={true} 
                                isTimeMismatch={isTimeMismatch} 
                                onDragStart={onJobDragStart} 
                                onDragEnd={onJobDragEnd} 
                                onUnassign={onUnassign}
                                onUpdateJob={onUpdateJob}
                                onRemove={onRemoveJob}
                                isCompact={isDoubleBooked}
                            />;
                })}
            </div>
        </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`mt-1 flex flex-col px-2 py-1.5 rounded-lg border-2 border-dashed transition-colors min-w-0 ${isOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
    >
      <div className="mb-1 flex justify-between items-center">
          <h4 className={`font-bold text-[11px] uppercase tracking-wide ${isDoubleBooked ? 'text-red-600' : 'text-gray-500'}`}>{label}</h4>
          {hasJobs && isDoubleBooked && <span className="text-[9px] bg-red-100 text-red-800 px-1.5 rounded font-bold">Double Booked</span>}
      </div>
      
      <div className={`flex-1 min-w-0 min-h-[32px] ${ isDoubleBooked ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : hasJobs ? 'space-y-2' : 'flex flex-col items-center justify-center' }`}>
        {jobs.map(job => {
            const isTimeMismatch = checkTimeMismatch(job.originalTimeframe, label);
            return <JobCard 
                        key={job.id} 
                        job={job} 
                        isMismatch={false} 
                        isTimeMismatch={isTimeMismatch} 
                        onDragStart={onJobDragStart} 
                        onDragEnd={onJobDragEnd} 
                        onUnassign={onUnassign}
                        onUpdateJob={onUpdateJob}
                        onRemove={onRemoveJob}
                        isCompact={isDoubleBooked}
                    />;
        })}
        {jobs.length === 0 && !isOptimized && <div className="text-[11px] text-gray-400 font-medium select-none">Drop job here</div>}
      </div>
    </div>
  );
};

const renderStars = (level?: number) => {
    const totalStars = 3;
    const filledStars = level && level > 0 ? level : 0;
    const emptyStars = totalStars - filledStars;
    return (
        <div className="flex text-[10px] tracking-tighter">
            {[...Array(filledStars)].map((_, i) => <span key={`filled-${i}`} className="text-amber-400">★</span>)}
            {[...Array(emptyStars)].map((_, i) => <span key={`empty-${i}`} className="text-gray-200">★</span>)}
        </div>
    );
};

const REGION_COLORS: Record<string, string> = {
    'PHX': 'bg-blue-100 text-blue-800 border-blue-200',
    'NORTH': 'bg-green-100 text-green-800 border-green-200',
    'SOUTH': 'bg-orange-100 text-orange-800 border-orange-200',
    'UNKNOWN': 'bg-gray-100 text-gray-800 border-gray-200'
};

const generateColorFromName = (name: string): string => {
  let hash = 0;
  if (name.length === 0) return 'hsl(0, 0%, 80%)';
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 75%)`; 
};

interface ScoreDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    repName: string;
    averageScore: number;
    jobs: DisplayJob[];
}

const ScoreDetailsModal: React.FC<ScoreDetailsModalProps> = ({ isOpen, onClose, repName, averageScore, jobs }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800 text-sm">{repName} - Performance Breakdown</h3>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            Daily Average Score: <span className="font-bold text-amber-600 bg-amber-50 px-1.5 rounded border border-amber-100">{averageScore}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition"><XIcon className="h-5 w-5" /></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
                    <div className="text-[10px] bg-blue-50 border border-blue-100 rounded p-2 text-blue-800">
                        Scores are calculated based on Proximity (Home & Job Clusters), Skill Matching (Roof Type), and Sales Rank (Priority Jobs Only).
                    </div>
                    {jobs.map(job => {
                        const b = job.scoreBreakdown || { distanceBase: 0, distanceCluster: 0, skillRoofing: 0, skillType: 0, performance: 0, penalty: 0 };
                        const isElite = typeof job.assignmentScore === 'number' && job.assignmentScore >= 90;
                        const penaltyVal = Math.abs(Math.round(b.penalty));
                        const showTypeScore = b.skillType >= 0; // If -1, hide it

                        return (
                            <div key={job.id} className={`border rounded-md p-2 text-sm shadow-sm ${isElite ? 'bg-amber-50/30 border-amber-200' : 'bg-white border-gray-200'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="min-w-0 pr-2">
                                        <div className="font-bold text-gray-800 text-xs uppercase truncate">{job.city || 'Unknown City'}</div>
                                        <div className="text-xs text-gray-500 truncate">{job.address}</div>
                                    </div>
                                    <div className={`font-bold px-1.5 py-0.5 rounded border whitespace-nowrap text-xs flex-shrink-0 ${isElite ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                        {job.assignmentScore || 0}
                                    </div>
                                </div>
                                <div className="grid grid-cols-6 gap-1 text-[10px] text-gray-500 mt-2">
                                    <div className="bg-gray-50 rounded px-1 py-1 text-center border border-gray-100">
                                        <div className="font-bold text-gray-800 text-xs">{Math.round(b.distanceBase)}</div>
                                        <div className="text-[8px] uppercase tracking-wide">Home</div>
                                    </div>
                                    <div className="bg-gray-50 rounded px-1 py-1 text-center border border-gray-100">
                                        <div className="font-bold text-gray-800 text-xs">{Math.round(b.distanceCluster)}</div>
                                        <div className="text-[8px] uppercase tracking-wide">Cluster</div>
                                    </div>
                                    <div className="bg-gray-50 rounded px-1 py-1 text-center border border-gray-100">
                                        <div className="font-bold text-gray-800 text-xs">{Math.round(b.skillRoofing)}</div>
                                        <div className="text-[8px] uppercase tracking-wide">Roof</div>
                                    </div>
                                    
                                    {showTypeScore ? (
                                        <div className="bg-gray-50 rounded px-1 py-1 text-center border border-gray-100">
                                            <div className="font-bold text-gray-800 text-xs">{Math.round(b.skillType)}</div>
                                            <div className="text-[8px] uppercase tracking-wide">Type</div>
                                        </div>
                                    ) : (
                                        <div className="rounded px-1 py-1 text-center border border-transparent opacity-25">
                                            <div className="text-xs">-</div>
                                            <div className="text-[8px] uppercase tracking-wide">Type</div>
                                        </div>
                                    )}

                                    <div className={`rounded px-1 py-1 text-center border ${b.performance > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
                                        <div className={`font-bold text-xs ${b.performance > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{b.performance > 0 ? `${Math.round(b.performance)}` : '-'}</div>
                                        <div className="text-[8px] uppercase tracking-wide">Rank</div>
                                    </div>
                                    <div className={`rounded px-1 py-1 text-center border ${penaltyVal > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
                                        <div className={`font-bold text-xs ${penaltyVal > 0 ? 'text-red-700' : 'text-gray-400'}`}>{penaltyVal > 0 ? `-${penaltyVal}` : '-'}</div>
                                        <div className="text-[8px] uppercase tracking-wide">Pen</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {jobs.length === 0 && <p className="text-gray-500 text-center italic text-xs">No scored jobs assigned.</p>}
                </div>
            </div>
        </div>
    );
};


const RepSchedule: React.FC<RepScheduleProps> = ({ rep, onJobDrop, onUnassign, onToggleLock, onUpdateJob, onRemoveJob, isSelected, onSelectRep, selectedDay, isExpanded, onToggleExpansion, draggedOverRepId, onSetDraggedOverRepId, onJobDragStart, onJobDragEnd, draggedJob, isInvalidDropTarget = false, invalidReason = '', isOverrideActive = false, isHighlighted = false }) => {
  const { appState, isAutoAssigning, isAiAssigning, isParsing, handleAutoAssignForRep, handleOptimizeRepRoute, handleUnoptimizeRepRoute, handleSwapSchedules, handleShowZipOnMap, setRepSettingsModalRepId, selectedDate } = useAppContext();
  const [isSwapMenuOpen, setIsSwapMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const swapMenuRef = useRef<HTMLDivElement>(null);
  const [isScoreDetailsOpen, setIsScoreDetailsOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const hasUnassignedJobs = appState.unassignedJobs.length > 0;
  const isAssignmentRunning = isAutoAssigning || isAiAssigning || isParsing;
  
  const unavailableSlotIdsForToday = useMemo(() => new Set(rep.unavailableSlots?.[selectedDay] || []), [rep.unavailableSlots, selectedDay]);
  
  const jobCount = useMemo(() => rep.schedule.flatMap(s => s.jobs).length, [rep.schedule]);
  const isFullyUnavailable = useMemo(() => unavailableSlotIdsForToday.size === 4 && !rep.isOptimized, [unavailableSlotIdsForToday, rep.isOptimized]);
  const isNotWorking = isFullyUnavailable && jobCount === 0;
  
  const wasHoverExpanded = useRef(false);
  const expansionTimer = useRef<number | null>(null);

  const assignedCities = useMemo(() => {
    const cities = new Set<string>();
    rep.schedule.forEach(slot => {
        slot.jobs.forEach(job => {
            if (job.city) {
                cities.add(job.city);
            }
        });
    });
    return Array.from(cities).sort();
  }, [rep.schedule]);

  const { averageScore, averageBreakdown, scoredJobs } = useMemo(() => {
      const jobs = rep.schedule.flatMap(s => s.jobs);
      const scored = jobs.filter(j => typeof j.assignmentScore === 'number');
      if (scored.length === 0) return { averageScore: 0, averageBreakdown: null, scoredJobs: [] };
      
      const totalScore = scored.reduce((sum, j) => sum + (j.assignmentScore || 0), 0);
      
      const totalBreakdown = scored.reduce((acc, j) => {
          const b = j.scoreBreakdown || { distanceBase: 0, distanceCluster: 0, skillRoofing: 0, skillType: 0, performance: 0, penalty: 0 };
          return {
              distanceBase: acc.distanceBase + b.distanceBase,
              distanceCluster: acc.distanceCluster + b.distanceCluster,
              skillRoofing: acc.skillRoofing + b.skillRoofing,
              skillType: acc.skillType + b.skillType,
              performance: acc.performance + b.performance,
              penalty: acc.penalty + b.penalty
          };
      }, { distanceBase: 0, distanceCluster: 0, skillRoofing: 0, skillType: 0, performance: 0, penalty: 0 });

      return {
          averageScore: Math.round(totalScore / scored.length),
          averageBreakdown: {
              distanceBase: Math.round(totalBreakdown.distanceBase / scored.length),
              distanceCluster: Math.round(totalBreakdown.distanceCluster / scored.length),
              skillRoofing: Math.round(totalBreakdown.skillRoofing / scored.length),
              skillType: Math.round(totalBreakdown.skillType / scored.length),
              performance: Math.round(totalBreakdown.performance / scored.length),
              penalty: Math.round(totalBreakdown.penalty / scored.length)
          },
          scoredJobs: scored
      };
  }, [rep.schedule]);

  const scoreTooltip = useMemo(() => {
      if (!averageBreakdown) return `Daily Average Score: ${averageScore}\n\n(No scored jobs)`;
      return `Daily Average Score: ${averageScore}\n\nAverage Breakdown:\n• Home Dist: ${averageBreakdown.distanceBase}\n• Cluster Dist: ${averageBreakdown.distanceCluster}\n• Roof Skill: ${averageBreakdown.skillRoofing}\n${averageBreakdown.skillType >= 0 ? `• Type Skill: ${averageBreakdown.skillType}\n` : ''}• Rank Bonus: ${averageBreakdown.performance}\n• Penalties: -${Math.abs(averageBreakdown.penalty)}\n\nClick to see details per job.`;
  }, [averageScore, averageBreakdown]);

  const googleMapsUrl = useMemo(() => {
    const addresses = rep.schedule
        .flatMap(slot => slot.jobs)
        .map(job => job.address);
    
    if (addresses.length === 0) return '#';
    
    const encoded = addresses.map(addr => encodeURIComponent(addr));
    
    // Add Home Base to start/end if available
    if (rep.zipCodes && rep.zipCodes.length > 0) {
        const homeAddr = encodeURIComponent(`${rep.zipCodes[0]}, Arizona`);
        encoded.unshift(homeAddr);
        encoded.push(homeAddr);
    }

    return `https://www.google.com/maps/dir/${encoded.join('/')}`;
  }, [rep.schedule, rep.zipCodes]);

  const handleInternalDrop = (jobId: string, target: { repId: string, slotId: string }, e: React.DragEvent<HTMLDivElement>) => {
    wasHoverExpanded.current = false;
    onJobDrop(jobId, target, e);
  };

  const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedJob) return;
    if (rep.isOptimized) return; 
    
    let targetSlotId = rep.schedule[0].id;
    
    if (draggedJob.originalTimeframe) {
       const mapped = mapTimeframeToSlotId(draggedJob.originalTimeframe);
       if (mapped) targetSlotId = mapped;
    } else {
        const openSlot = rep.schedule.find(s => !unavailableSlotIdsForToday.has(s.id) && s.jobs.length === 0);
        if (openSlot) targetSlotId = openSlot.id;
    }
    
    onJobDrop(draggedJob.id, { repId: rep.id, slotId: targetSlotId }, e);
    wasHoverExpanded.current = false;
  };

  useEffect(() => {
    const isBeingHovered = draggedOverRepId === rep.id;
    if (expansionTimer.current) { clearTimeout(expansionTimer.current); expansionTimer.current = null; }
    if (isBeingHovered && !isExpanded) {
      expansionTimer.current = window.setTimeout(() => { onToggleExpansion(); wasHoverExpanded.current = true; }, 300);
    } else if (!isBeingHovered && isExpanded && wasHoverExpanded.current) {
      onToggleExpansion(); wasHoverExpanded.current = false;
    }
    return () => { if (expansionTimer.current) clearTimeout(expansionTimer.current); };
  }, [draggedOverRepId, rep.id, isExpanded, onToggleExpansion]);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
        if (swapMenuRef.current && !swapMenuRef.current.contains(event.target as Node)) { setIsSwapMenuOpen(false); }
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setIsMenuOpen(false); }
    }
    if (isSwapMenuOpen || isMenuOpen) { document.addEventListener("mousedown", handleClickOutside); }
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [isSwapMenuOpen, isMenuOpen]);

  useEffect(() => { if (!isExpanded) { wasHoverExpanded.current = false; } }, [isExpanded]);

 const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if ((isInvalidDropTarget || rep.isLocked || rep.isOptimized) && !isOverrideActive) { e.dataTransfer.dropEffect = 'none'; } else { e.dataTransfer.dropEffect = 'move'; }
    if (draggedOverRepId !== rep.id) { onSetDraggedOverRepId(rep.id); }
  };

  const isBeingHoveredWithJob = draggedOverRepId === rep.id && draggedJob;

  const skillMatchStatus = useMemo(() => {
    if (!isBeingHoveredWithJob || !draggedJob) return 'none';
    const notesLower = draggedJob.notes.toLowerCase();
    const jobTags = TAG_KEYWORDS.filter(keyword => new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower));
    if (jobTags.length === 0) return 'none';
    const primaryTag = jobTags[0];
    const skillLevel = rep.skills?.[primaryTag];
    if (skillLevel === undefined || skillLevel <= 1) return 'poor';
    if (skillLevel === 2) return 'average';
    if (skillLevel >= 3) return 'good';
    return 'none';
  }, [isBeingHoveredWithJob, draggedJob, rep.skills]);

  const isDoubleBooked = useMemo(() => { return rep.schedule.some(slot => slot.jobs.length > 1); }, [rep.schedule]);

  const containerClasses = useMemo(() => {
    const base = 'p-2 rounded-lg transition-all duration-300 border-2 min-w-0';
    let stateClasses = '';
    if (rep.isOptimized) { stateClasses = 'border-teal-400 bg-teal-50/50 shadow-inner'; } 
    else if (rep.isLocked) { stateClasses = 'border-amber-400 bg-amber-50 shadow-inner'; } 
    else if (isHighlighted) { stateClasses = 'border-sky-400 bg-sky-50 shadow-lg scale-[1.02]'; } 
    else if (isBeingHoveredWithJob) {
        if (isInvalidDropTarget) {
            if (isOverrideActive) { stateClasses = 'border-purple-500 bg-purple-50/50'; } 
            else { stateClasses = 'border-red-500 bg-red-100/50 opacity-60 cursor-not-allowed'; }
        } else {
            switch (skillMatchStatus) {
                case 'good': stateClasses = 'border-green-500 bg-green-50/50'; break;
                case 'average': stateClasses = 'border-yellow-500 bg-yellow-50/50'; break;
                case 'poor': stateClasses = 'border-red-500 bg-red-50/50'; break;
                default: stateClasses = 'border-indigo-400 bg-indigo-50/50';
            }
        }
    } else if (isSelected) { stateClasses = 'border-indigo-500 bg-indigo-50'; } 
    else { stateClasses = 'border-transparent bg-gray-50'; }
    
    const unavailabilityClasses = isNotWorking ? 'opacity-60 bg-gray-100 grayscale' : '';
    
    return `${base} ${stateClasses} ${unavailabilityClasses}`;
  }, [isSelected, isBeingHoveredWithJob, skillMatchStatus, isNotWorking, isInvalidDropTarget, isOverrideActive, isHighlighted, rep.isLocked, rep.isOptimized]);
  
  const containerTitle = useMemo(() => {
    if (!isBeingHoveredWithJob) return '';
    if (rep.isOptimized) { return `Schedule is optimized. Use the global 'Undo' button to revert.` }
    if (rep.isLocked) { return `This rep is locked. Hold Alt/Option to override and drop job.` }
    if (isInvalidDropTarget) {
        if (isOverrideActive) { return `OVERRIDE ACTIVE: ${invalidReason}`; }
        return `${invalidReason} Hold Alt/Option to override.`;
    }
    return '';
  }, [isBeingHoveredWithJob, isInvalidDropTarget, isOverrideActive, invalidReason, rep.isLocked, rep.isOptimized]);

  const repColor = useMemo(() => generateColorFromName(rep.name), [rep.name]);

  const rankColor = useMemo(() => {
      const rank = rep.salesRank;
      if (!rank) return 'text-gray-400';
      if (rank === 1) return 'text-yellow-600 font-black'; // Gold
      if (rank === 2) return 'text-gray-600 font-bold'; // Silver
      if (rank === 3) return 'text-amber-700 font-bold'; // Bronze
      if (rank <= 10) return 'text-slate-600 font-semibold';
      return 'text-gray-500';
  }, [rep.salesRank]);

  const rankIcon = useMemo(() => {
      const rank = rep.salesRank;
      if (rank === 1) return <span className="text-sm">🥇</span>;
      if (rank === 2) return <span className="text-sm">🥈</span>;
      if (rank === 3) return <span className="text-sm">🥉</span>;
      if (rank && rank <= 10) return <span className="text-xs">⭐</span>;
      return null;
  }, [rep.salesRank]);

  const handleSwapClick = (targetRepId: string) => {
      handleSwapSchedules(rep.id, targetRepId);
      setIsSwapMenuOpen(false);
      setIsMenuOpen(false);
  };

  const handleCopySchedule = () => {
      const allJobs = rep.schedule.flatMap(s => s.jobs);
      if (allJobs.length === 0) return;

      const dateStr = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      let text = `Route for ${rep.name} - ${dateStr}\n\n`;

      allJobs.forEach((job, idx) => {
          const timeDisplay = job.originalTimeframe || job.timeSlotLabel || 'Scheduled';
          text += `${timeDisplay}: ${job.city?.toUpperCase() || ''}`;
          
          // Add Original Request info and Warning if different and NO OVERLAP
          if (job.originalTimeframe && job.timeSlotLabel && job.originalTimeframe !== job.timeSlotLabel) {
              const overlaps = doTimesOverlap(job.originalTimeframe, job.timeSlotLabel);
              if (!overlaps) {
                  text += ` (Scheduled: ${job.timeSlotLabel})`;
                  text += ` - WARNING: POTENTIAL RESCHEDULE NECESSARY`;
              }
          }
          text += `\n`;

          text += `${job.address}\n`;
          if (job.notes) text += `Notes: ${job.notes}\n`;
          if (job.customerName && job.customerName !== job.city) text += `Customer: ${job.customerName}\n`;
          text += `\n`;
      });
      
      text += `Google Maps Route:\n${googleMapsUrl}`;

      navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
      });
  };

  return (
    <div onDragOver={handleDragOver} onDrop={handleContainerDrop} className={containerClasses} title={containerTitle}>
      <div className="flex justify-between items-center cursor-pointer" onClick={onToggleExpansion}>
        <div className="flex items-center min-w-0 flex-1 mr-2">
            <div 
                className="w-5 h-5 rounded-full mr-2 flex-shrink-0 ring-1 ring-inset ring-gray-300"
                style={{ backgroundColor: repColor }}
                title={rep.name}
            />
          <h3 className="text-sm font-bold truncate">{rep.name}</h3>
           {rep.isOptimized ? (
                <div className="ml-2 flex items-center bg-teal-100 text-teal-800 border border-teal-200 rounded-full px-2 py-0.5">
                    <span className="text-xs font-semibold mr-1">Optimized</span>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleUnoptimizeRepRoute(rep.id); }}
                        className="p-0.5 hover:bg-teal-200 rounded-full text-teal-700 transition-colors"
                        title="Reset to original schedule"
                    >
                        <UndoIcon className="h-3 w-3" />
                    </button>
                </div>
           ) : isDoubleBooked && (
                <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 whitespace-nowrap`}>Double-Booked</span>
            )}
          {rep.region && rep.region !== 'UNKNOWN' && rep.region !== 'PHX' && (
            <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${REGION_COLORS[rep.region]}`}>{rep.region}</span>
          )}
          {isFullyUnavailable && (
              <span className="ml-2 text-[10px] bg-gray-200 text-gray-600 font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">Unavailable</span>
          )}
          
          {jobCount > 0 && (
              <span 
                onClick={(e) => { e.stopPropagation(); setIsScoreDetailsOpen(true); }}
                className="ml-2 flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors whitespace-nowrap" 
                title={scoreTooltip}
              >
                  <TrophyIcon className="h-3 w-3" />
                  Avg: {averageScore}
              </span>
          )}
        </div>
        <div className="flex items-center space-x-1 flex-shrink-0">
             {rep.isOptimized && (
                 <button
                    onClick={(e) => { e.stopPropagation(); handleCopySchedule(); }}
                    className={`p-1 rounded-full text-sm transition-colors ${copySuccess ? 'bg-green-100 text-green-600' : 'bg-gray-100 hover:bg-teal-100 text-gray-400 hover:text-teal-600'}`}
                    title="Copy Itinerary to Clipboard"
                 >
                     <MessageIcon className="h-3.5 w-3.5" />
                 </button>
             )}
             <button 
                onClick={(e) => { e.stopPropagation(); onSelectRep(e); }}
                className={`p-1 rounded-full text-sm transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-indigo-100 text-gray-400 hover:text-indigo-600'}`}
                title="Pin to Map View"
              >
                <PinIcon className="h-3.5 w-3.5" />
              </button>

            <div className="relative" ref={menuRef}>
                <button
                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(prev => !prev); }}
                    className="p-1 rounded-full text-sm transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                    title="More Options"
                >
                    <MenuIcon className="h-4 w-4" />
                </button>
                
                {isMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1 animate-fade-in">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleAutoAssignForRep(rep.id); setIsMenuOpen(false); }}
                            className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={rep.isLocked || !hasUnassignedJobs || isAssignmentRunning || rep.isOptimized}
                        >
                            <AutoAssignIcon className="h-3 w-3 mr-2" /> Auto-Assign
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleOptimizeRepRoute(rep.id); setIsMenuOpen(false); }}
                            className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={jobCount < 2 || isAssignmentRunning}
                        >
                            <OptimizeIcon className="h-3 w-3 mr-2" /> Optimize Route
                        </button>
                        
                        <div className="relative" ref={swapMenuRef}>
                             <button
                                onClick={(e) => { e.stopPropagation(); setIsSwapMenuOpen(prev => !prev); }}
                                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={rep.isLocked || rep.isOptimized || jobCount === 0}
                            >
                                <SwapIcon className="h-3 w-3 mr-2" /> Swap Schedule...
                            </button>
                            {isSwapMenuOpen && (
                                <div className="absolute top-0 right-full mr-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-30 max-h-60 overflow-y-auto">
                                    <div className="p-2 text-[10px] font-bold text-gray-500 border-b bg-gray-50">Swap with:</div>
                                    {appState.reps.filter(r => r.id !== rep.id).map(otherRep => (
                                        <button
                                            key={otherRep.id}
                                            onClick={(e) => { e.stopPropagation(); handleSwapClick(otherRep.id); }}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed truncate"
                                            disabled={otherRep.isLocked || otherRep.isOptimized}
                                        >
                                            {otherRep.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={(e) => { e.stopPropagation(); setRepSettingsModalRepId(rep.id); setIsMenuOpen(false); }}
                            className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                            <SettingsIcon className="h-3 w-3 mr-2" /> Rep Settings
                        </button>
                        
                        <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { if (jobCount === 0) e.preventDefault(); setIsMenuOpen(false); e.stopPropagation(); }}
                            className={`w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center ${jobCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <ClipboardIcon className="h-3 w-3 mr-2" /> Google Maps
                        </a>
                        
                        <div className="border-t border-gray-100 my-1"></div>
                        
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleLock(rep.id); setIsMenuOpen(false); }}
                            className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                            {rep.isLocked ? <UnlockIcon className="h-3 w-3 mr-2" /> : <LockIcon className="h-3 w-3 mr-2" />}
                            {rep.isLocked ? 'Unlock Rep' : 'Lock Rep'}
                        </button>
                    </div>
                )}
            </div>

            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </div>
      </div>
      <div className="mt-1 space-y-0.5">
          <div className="flex justify-between items-start">
              <div className="space-y-0.5 min-w-0">
                  {rep.zipCodes && rep.zipCodes.length > 0 && (
                    <div className="text-[10px] text-gray-500 flex flex-wrap items-center gap-1">
                      <span>Areas:</span>
                      {rep.zipCodes.map(zip => (
                        <button
                            key={zip}
                            onClick={(e) => { e.stopPropagation(); handleShowZipOnMap(zip, rep); }}
                            className="px-1 bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 rounded text-[9px] font-mono transition-colors border border-gray-200"
                            title="Show area on map"
                            type="button"
                        >
                            {zip}
                        </button>
                      ))}
                    </div>
                  )}
                  {assignedCities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                          {assignedCities.map(city => (
                              <span key={city} className="px-1.5 bg-indigo-50 text-indigo-800 border border-indigo-100 text-[9px] font-bold rounded">{city}</span>
                          ))}
                      </div>
                  )}
              </div>
              <div className={`text-[10px] text-right font-mono flex flex-col items-end flex-shrink-0 ml-2 ${rankColor}`} title="Sales Rank (lower is better)">
                  {rep.salesRank ? (
                      <>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                            {rankIcon}
                            Rank: <span className={`font-bold ${rep.salesRank <= 3 ? 'text-sm' : ''}`}>#{rep.salesRank}</span>
                        </span>
                      </>
                  ) : (
                      <span className="text-gray-300 whitespace-nowrap">Unranked</span>
                  )}
              </div>
          </div>
      </div>
      
      {isExpanded && (
        <>
            {rep.skills && (
              <div className="mt-1.5 pt-1 border-t border-dashed border-gray-200">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-center">
                  {TAG_KEYWORDS.map(skill => {
                    const level = rep.skills?.[skill];
                    if (level && level > 0) {
                      return ( <div key={skill} className="flex items-center space-x-1 text-[9px]"> <span className="text-gray-500 font-medium">{skill}</span> {renderStars(level)} </div> )
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
            <div className="mt-1.5 space-y-0.5">
            {rep.isOptimized ? (
                <div className="mt-2 space-y-2">
                    {rep.schedule.flatMap(s => s.jobs).map((job, idx, allJobs) => {
                        return (
                            <React.Fragment key={job.id}>
                                <JobCard 
                                    job={job} 
                                    isMismatch={false} 
                                    isTimeMismatch={false} 
                                    onDragStart={onJobDragStart} 
                                    onDragEnd={onJobDragEnd} 
                                    onUnassign={onUnassign}
                                    onUpdateJob={onUpdateJob}
                                    onRemove={onRemoveJob}
                                    isDraggable={false} 
                                />
                            </React.Fragment>
                        );
                    })}
                </div>
            ) : (
                rep.schedule.map(slot => {
                    const isUnavailable = unavailableSlotIdsForToday.has(slot.id);
                    return ( <DropZone key={slot.id} repId={rep.id} slotId={slot.id} onJobDrop={handleInternalDrop} label={slot.label} isUnavailable={isUnavailable} onJobDragStart={onJobDragStart} onJobDragEnd={onJobDragEnd} draggedJob={draggedJob} jobs={slot.jobs} onUnassign={onUnassign} onUpdateJob={onUpdateJob} onRemoveJob={onRemoveJob} isOptimized={false} /> );
                })
            )}
            </div>
        </>
      )}
      
      <ScoreDetailsModal 
        isOpen={isScoreDetailsOpen} 
        onClose={() => setIsScoreDetailsOpen(false)} 
        repName={rep.name} 
        averageScore={averageScore}
        jobs={scoredJobs as DisplayJob[]}
      />
    </div>
  );
};

export default RepSchedule;