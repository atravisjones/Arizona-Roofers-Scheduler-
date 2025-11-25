
import React, { useMemo, useState, useEffect } from 'react';
import { Job, DisplayJob } from '../types';
import { TAG_KEYWORDS } from '../constants';
import { RescheduleIcon, UnassignJobIcon, StarIcon, MapPinIcon, EditIcon, SaveIcon, XIcon, UserIcon, TrashIcon, TrophyIcon } from './icons';
import { useAppContext } from '../context/AppContext';

const TAG_COLORS: Record<string, string> = {
    'Tile': 'bg-orange-100 text-orange-800 border-orange-200',
    'Shingle': 'bg-amber-100 text-amber-800 border-amber-200',
    'Flat': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'Metal': 'bg-slate-200 text-slate-800 border-slate-300',
    'Insurance': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'Commercial': 'bg-purple-100 text-purple-800 border-purple-200',
    'stories': 'bg-teal-100 text-teal-800 border-teal-200',
    'sqft': 'bg-sky-100 text-sky-800 border-sky-200',
    'yrs': 'bg-stone-100 text-stone-800 border-stone-200',
};

interface JobCardProps { 
  job: Job;
  isMismatch?: boolean;
  isTimeMismatch?: boolean;
  onDragStart?: (job: Job) => void;
  onDragEnd?: () => void;
  onUnassign?: (jobId: string) => void;
  onUpdateJob?: (jobId: string, updatedDetails: Pick<Job, 'customerName' | 'address' | 'notes'>) => void;
  onRemove?: (jobId: string) => void;
  isCompact?: boolean;
  isDraggable?: boolean;
}

export const JobCard: React.FC<JobCardProps> = ({ 
    job, isMismatch, isTimeMismatch, onDragStart, onDragEnd, onUnassign, onUpdateJob, onRemove, isCompact = false, isDraggable = true
}) => {
    const { setHoveredJobId } = useAppContext();
    const [isEditing, setIsEditing] = useState(false);
    const [customerName, setCustomerName] = useState(job.customerName);
    const [address, setAddress] = useState(job.address);
    const [notes, setNotes] = useState(job.notes);

    useEffect(() => {
        setCustomerName(job.customerName);
        setAddress(job.address);
        setNotes(job.notes);
    }, [job]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (isEditing || !isDraggable) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('jobId', job.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(job);
    }
    
    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUpdateJob?.(job.id, { customerName, address, notes });
        setIsEditing(false);
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCustomerName(job.customerName);
        setAddress(job.address);
        setNotes(job.notes);
        setIsEditing(false);
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to permanently remove this job?\n\n${job.address}`)) {
            onRemove?.(job.id);
        }
    };

    const allTags = useMemo(() => {
        if (!job.notes) return [];
        const notesLower = job.notes.toLowerCase();
        
        // Roof age tag (e.g. "16yrs") - Priority 1
        const ageMatch = job.notes.match(/\b(\d+)\s*yrs\b/i);
        const ageTag = ageMatch ? [{ type: 'yrs', value: `${ageMatch[1]}yrs`, color: TAG_COLORS['yrs'] }] : [];

        // Roof type tags - Priority 2
        const roofTags = TAG_KEYWORDS.filter(keyword => new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower))
            .map(tag => ({ type: 'roof', value: tag, color: TAG_COLORS[tag] }));

        // Square footage tag (e.g., "1802sq" or "1802 sq") - Priority 3
        const sqftMatch = job.notes.match(/\b(\d+)\s*sq\.?\b/i);
        const sqftTag = sqftMatch ? [{ type: 'sqft', value: `${sqftMatch[1]} sqft`, color: TAG_COLORS['sqft'] }] : [];

        // Stories tag (e.g., "1S", "2S") - Priority 4
        const storiesMatch = job.notes.match(/\b(\d)S\b/i);
        const storiesTag = storiesMatch ? [{ type: 'stories', value: `${storiesMatch[1]} Story`, color: TAG_COLORS['stories'] }] : [];
        
        return [...ageTag, ...roofTags, ...sqftTag, ...storiesTag];
    }, [job.notes]);

  const isReschedule = useMemo(() => job.notes.includes('Recommended Reschedule'), [job.notes]);
  const { isPriority, priorityReason } = useMemo(() => {
    const isPrio = job.notes.includes('#');
    if (!isPrio) return { isPriority: false, priorityReason: '' };
    const match = job.notes.match(/#\s*\(([^)]+)\)/);
    return { isPriority: true, priorityReason: match ? match[1] : 'Priority Job' };
  }, [job.notes]);
  const isActuallyMismatched = isMismatch || isTimeMismatch;

  const displayJob = job as DisplayJob;
  const assignmentScore = displayJob.assignmentScore;
  const isEliteMatch = typeof assignmentScore === 'number' && assignmentScore >= 90;

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (isEditing) return;
      if (isCompact && !isEditing) {
          setIsEditing(true); // In compact lists like Needs Details, click often implies desire to edit
      }
  };
  
  const cardClasses = useMemo(() => {
    const base = "border rounded-lg shadow-sm transition-all duration-200 relative group overflow-hidden";
    let stateClasses = '';

    if (isEditing) {
        stateClasses = "ring-2 ring-indigo-500 bg-indigo-50/50 p-2";
    } else if (isDraggable) {
        stateClasses = "cursor-grab active:cursor-grabbing";
    } else {
        stateClasses = "cursor-pointer"; // Indicate clickable
    }

    let colorClasses = '';
    if (isEliteMatch && !isEditing) {
        // Elite Match Style: Gold/Amber Glow
        colorClasses = "bg-gradient-to-br from-white to-amber-50 border-amber-400 shadow-md ring-1 ring-amber-200/50"; 
    } else if (isPriority && !isEditing) {
        colorClasses = "bg-amber-100 border-amber-300 hover:shadow-md"; // Gold/Yellow background for priority
    } else if (isActuallyMismatched && !isEditing) {
        colorClasses = "bg-red-50 border-red-300 hover:shadow-md";
    } else if (isReschedule && !isEditing) {
        colorClasses = "bg-blue-50 border-blue-200 hover:shadow-md";
    } else if (!isEditing) {
        colorClasses = "bg-white border-gray-200 hover:shadow-md";
    }
    
    return `${base} ${stateClasses} ${colorClasses}`;
  }, [isActuallyMismatched, isPriority, isReschedule, isEditing, isDraggable, isEliteMatch]);

  const googleMapsUrl = useMemo(() => {
    const addressParts = [job.address, job.city, job.zipCode].filter(Boolean);
    if (addressParts.length === 0) return '#';
    const query = encodeURIComponent(addressParts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }, [job.address, job.city, job.zipCode]);


  let mismatchTitle = '';
  if (isMismatch) {
      mismatchTitle = "Schedule Mismatch: Rep is unavailable during this time.";
  } else if (isTimeMismatch) {
      mismatchTitle = `Time Mismatch: Job's original schedule was ${job.originalTimeframe}.`;
  } else if (isReschedule) {
      mismatchTitle = job.notes; 
  }

  const getScoreTooltip = (job: DisplayJob) => {
      if (!job.scoreBreakdown) return "Assignment Score calculated based on proximity, skills, and rep performance.";
      const b = job.scoreBreakdown;
      const penaltyVal = Math.abs(Math.round(b.penalty));
      return `Assignment Score: ${job.assignmentScore} / 100 ${isEliteMatch ? '🏆 ELITE MATCH' : ''}

SCORING BREAKDOWN:
------------------
• Job Cluster (${Math.round(b.distanceCluster)}): Proximity to other jobs in today's route.
• Roofing Skill (${Math.round(b.skillRoofing)}): Match for specific roof type (Tile, Flat, etc).
${b.skillType >= 0 ? `• Job Type (${Math.round(b.skillType)}): Match for Insurance vs Commercial.` : ''}
• Home Base (${Math.round(b.distanceBase)}): Proximity to rep's home zip code.
${b.performance > 0 ? `• Sales Rank (${Math.round(b.performance)}): Weighted High for Priority Jobs.` : ''}
${penaltyVal > 0 ? `• PENALTY (-${penaltyVal}): Deducted for scheduling conflicts.` : ''}`;
  };

  // Action Button Component
  const ActionBtn = ({ onClick, icon: Icon, label, title }: { onClick?: (e: React.MouseEvent) => void, icon: any, label: string, title?: string }) => (
      <button 
        type="button" 
        onClick={onClick} 
        className="flex items-center space-x-1 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-600 px-1.5 py-0.5 rounded shadow-sm transition-all text-[9px] font-semibold leading-none whitespace-nowrap h-5"
        title={title}
      >
          <Icon className="h-3 w-3" />
          <span className="hidden sm:inline">{label}</span>
      </button>
  );

  const MapsLink = () => (
      <a 
        href={googleMapsUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        onClick={(e) => e.stopPropagation()} 
        className="flex items-center space-x-1 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 text-gray-600 px-1.5 py-0.5 rounded shadow-sm transition-all text-[9px] font-semibold leading-none whitespace-nowrap h-5 decoration-0"
        title="Open in Google Maps"
      >
          <MapPinIcon className="h-3 w-3" />
          <span className="hidden sm:inline">Maps</span>
      </a>
  );

  if (isEditing) {
      return (
        <div className={cardClasses} onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col space-y-2">
            <div>
                <label className="text-xs font-bold text-gray-600">City / Cust.</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-1 border bg-white border-gray-300 rounded-md text-sm" autoFocus />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-600">Address</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-1 border bg-white border-gray-300 rounded-md text-sm" rows={2} />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-600">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-1 border bg-white border-gray-300 rounded-md text-sm" rows={3} />
            </div>
            <div className="mt-1 pt-1 border-t border-gray-200/50 flex items-center justify-between">
                {onRemove && (
                    <button type="button" onClick={handleRemove} className="flex items-center space-x-0.5 px-2 py-1 text-[10px] border rounded-md text-red-600 bg-white hover:bg-red-50 transition" title="Remove Job Permanently">
                    <TrashIcon className="h-3 w-3" />
                    <span>Del</span>
                    </button>
                )}
                <div className="flex items-center space-x-1">
                    <button onClick={handleCancel} className="flex items-center space-x-0.5 px-2 py-1 text-[10px] border rounded-md text-gray-600 bg-white hover:bg-gray-100 transition" title="Cancel">
                    <XIcon className="h-3 w-3" />
                    <span>Cancel</span>
                    </button>
                    <button onClick={handleSave} className="flex items-center space-x-0.5 px-2 py-1 text-[10px] border rounded-md text-white bg-green-600 hover:bg-green-700 transition" title="Save Changes">
                    <SaveIcon className="h-3 w-3" />
                    <span>Save</span>
                    </button>
                </div>
            </div>
            </div>
        </div>
      )
  }

  // Display Logic for Time Slot
  const displayTimeLabel = displayJob.timeSlotLabel || job.originalTimeframe || 'Anytime';
  const shortTimeLabel = displayTimeLabel.split(' ')[0]; // Gets "7:30am" from "7:30am - 9:00am"
  
  // Check if we should show the original request (if optimized and different)
  const showOriginalTime = job.originalTimeframe && displayJob.timeSlotLabel && job.originalTimeframe !== displayJob.timeSlotLabel;
  const formattedOriginalTime = job.originalTimeframe ? job.originalTimeframe.replace(/\s/g, '').replace(/am/gi, 'a').replace(/pm/gi, 'p') : '';

  return (
    <div
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={handleCardClick}
      onMouseEnter={() => setHoveredJobId(job.id)}
      onMouseLeave={() => setHoveredJobId(null)}
      className={cardClasses}
      title={mismatchTitle}
    >
        {/* Header: City & Status */}
        <div className={`px-2 pt-1.5 pb-1 flex justify-between items-start ${isCompact ? 'flex-col gap-1' : ''}`}>
            <div className="min-w-0 flex-1 mr-2">
                <h3 className="font-extrabold text-xs uppercase tracking-tight text-gray-800 truncate leading-tight">
                    {job.city || 'Unknown City'}
                </h3>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {isPriority && <StarIcon className="h-3.5 w-3.5 text-amber-600 drop-shadow-sm" />}
                
                {showOriginalTime && (
                    <span className="text-[9px] text-gray-400 font-mono mr-0.5 hidden sm:inline-block bg-gray-50 px-1 rounded border border-gray-100" title={`Original Request: ${job.originalTimeframe}`}>
                        Req:{formattedOriginalTime}
                    </span>
                )}

                <span className={`text-[10px] font-bold px-1.5 rounded-full border ${
                    displayTimeLabel !== 'Anytime' ? 'bg-white/80 border-gray-200 text-gray-700 shadow-sm' : 'bg-gray-100 text-gray-500 border-transparent'
                }`}>
                    {/* Use full label if it's a specific generated slot (contains hyphen), else short */}
                    {displayTimeLabel.includes('-') && displayTimeLabel.length < 20 ? displayTimeLabel : shortTimeLabel}
                </span>
            </div>
        </div>

        {/* Middle: Tags & Actions Grid */}
        <div className="px-2 py-1 grid grid-cols-1 gap-1.5">
            {/* Tags */}
            {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {allTags.map((tag, idx) => (
                        <span key={`${tag.value}-${idx}`} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${tag.color}`}>
                            {tag.value}
                        </span>
                    ))}
                </div>
            )}
            
            {/* Action Bar */}
            <div className="flex items-center justify-end gap-1 mt-0.5">
                {typeof assignmentScore === 'number' && !isCompact && (
                    <span 
                        className={`mr-auto text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-help flex items-center gap-0.5
                            ${isEliteMatch 
                                ? 'text-amber-700 bg-amber-50 border-amber-300 shadow-sm ring-1 ring-amber-100' 
                                : 'text-gray-500 bg-gray-100 border-gray-200'
                            }`} 
                        title={getScoreTooltip(displayJob)}
                    >
                        {isEliteMatch && <TrophyIcon className="h-2.5 w-2.5 text-amber-600" />}
                        {assignmentScore}
                    </span>
                )}
                
                {/* Only show simplified actions if compact, but allow click-to-edit */}
                {!isCompact ? (
                    <>
                        <MapsLink />
                        {onUnassign && (
                            <ActionBtn 
                                onClick={(e) => { e.stopPropagation(); onUnassign(job.id); }} 
                                icon={UnassignJobIcon} 
                                label="Unassign" 
                            />
                        )}
                        {onUpdateJob && (
                            <ActionBtn 
                                onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} 
                                icon={EditIcon} 
                                label="Edit" 
                            />
                        )}
                    </>
                ) : (
                    // Compact Mode Actions (Maps only usually, since card click edits)
                    <div className="w-full flex justify-between items-center">
                         <span className="text-[9px] text-indigo-500 font-semibold italic">Click card to edit</span>
                         <MapsLink />
                    </div>
                )}
            </div>
        </div>

        {/* Footer: Address */}
        <div className="px-2 pb-1.5 pt-1 mt-0.5 border-t border-black/5">
            <p className="text-[10px] text-gray-600 truncate font-medium leading-tight" title={job.address}>
                {job.address}
            </p>
        </div>
    </div>
  );
};
