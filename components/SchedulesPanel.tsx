import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import RepSchedule from './RepSchedule';
import { LoadingIcon, ErrorIcon, SearchIcon, DragHandleIcon, ExpandAllIcon, CollapseAllIcon, UnassignAllIcon, LockIcon, UnlockIcon, XIcon, UserIcon, MapPinIcon, TagIcon, StarIcon, RoofIcon, StoriesIcon, SizeIcon, ChevronDownIcon, TrophyIcon } from './icons';
import { SortKey, Job, Rep, DisplayJob } from '../types';
import { EAST_TO_WEST_CITIES } from '../services/geography';
import { TIME_SLOTS, TAG_KEYWORDS } from '../constants';

type ActiveTab = 'rep' | 'city' | 'tags' | 'skills';

// Helper function to format rep names for the filter tags
const formatRepNameForFilter = (fullName: string): string => {
  const cleanedName = fullName.replace(/"/g, '').trim();
  const parts = cleanedName.split(' ').filter(Boolean);
  if (parts.length === 0) return fullName;
  const firstName = parts[0];
  if (parts.length === 1) return firstName;
  let lastName = '';
  const lastPart = parts[parts.length - 1];
  const regions = ['PHOENIX', 'TUCSON'];
  if (parts.length === 2 && regions.includes(lastPart.toUpperCase())) return firstName;
  if (parts.length === 3 && regions.includes(lastPart.toUpperCase())) lastName = parts[1];
  else if (parts.length > 2 && regions.includes(lastPart.toUpperCase())) lastName = parts[parts.length - 2];
  else lastName = parts[parts.length - 1];
  return `${firstName} ${lastName.charAt(0).toUpperCase()}`;
};

const TabButton: React.FC<{ 
    tabId: ActiveTab; 
    activeTab: ActiveTab; 
    label: string; 
    icon: React.ReactNode; 
    onClick: (tab: ActiveTab) => void;
}> = ({ tabId, activeTab, label, icon, onClick }) => (
    <button
        onClick={() => onClick(tabId)}
        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${
            activeTab === tabId 
            ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' 
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
        }`}
    >
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { 
            className: `h-3.5 w-3.5 ${activeTab === tabId ? 'text-indigo-500' : 'text-gray-400'}` 
        })}
        <span>{label}</span>
    </button>
);

const chipBaseClass = "px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all duration-200 flex items-center gap-1 select-none cursor-pointer hover:shadow-sm";
const chipActiveClass = "bg-indigo-600 text-white border-indigo-600 shadow-sm ring-1 ring-indigo-200";
const chipInactiveClass = "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600";

// Optimized Rep Styles (Teal)
const chipOptimizedActiveClass = "bg-teal-600 text-white border-teal-600 shadow-sm ring-1 ring-teal-200";
const chipOptimizedInactiveClass = "bg-teal-50 text-teal-700 border-teal-200 hover:border-teal-300 hover:bg-teal-100 hover:text-teal-800";

interface SchedulesPanelProps {
    onDragStart: () => void;
    onDragEnd: () => void;
}

const SchedulesPanel: React.FC<SchedulesPanelProps> = ({ onDragStart, onDragEnd }) => {
  const { 
      appState, isLoadingReps, repsError, filteredReps, 
      expandedRepIds, draggedOverRepId, draggedJob,
      handleJobDrop, handleUnassignJob, handleToggleRepLock, handleUpdateJob, handleRemoveJob,
      handleToggleRepExpansion, handleToggleAllReps, handleShowRoute,
      setDraggedOverRepId, handleJobDragEnd, setDraggedJob,
      sortConfig, setSortConfig, handleClearAllSchedules, assignedJobsCount, isOverrideActive,
      setFilteredAssignedJobs, selectedRepId, selectedDate, checkCityRuleViolation
  } = useAppContext();

  // Filter States
  const [repSearchTerm, setRepSearchTerm] = useState('');
  const [cityFilters, setCityFilters] = useState<Set<string>>(new Set());
  const [lockFilter, setLockFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
  const [activeTab, setActiveTab] = useState<ActiveTab>('rep');

  // Determine the actual day name (e.g. "Monday") for the selected date to check availability correctly
  const selectedDay = useMemo(() => selectedDate.toLocaleDateString('en-US', { weekday: 'long' }), [selectedDate]);

  const visibleReps = useMemo(() => filteredReps(repSearchTerm, cityFilters, lockFilter), [filteredReps, repSearchTerm, cityFilters, lockFilter]);

  const assignedCities = useMemo(() => {
      const cities = new Set<string>();
      appState.reps.forEach(rep => {
          rep.schedule.forEach(slot => slot.jobs.forEach(job => {
              if (job.city) cities.add(job.city);
          }));
      });
      return Array.from(cities).sort();
  }, [appState.reps]);

  // Push visible jobs to context for synchronized map filtering. 
  // Use a ref to prevent infinite loops by checking content equality (via IDs)
  const prevVisibleJobIdsRef = useRef<string>('');
  
  useEffect(() => {
      const visibleJobs = visibleReps.flatMap(rep => 
          rep.schedule.flatMap(slot => 
              slot.jobs.map(job => ({ ...job, assignedRepName: rep.name, timeSlotLabel: slot.label }))
          )
      );
      
      const idsHash = JSON.stringify(visibleJobs.map(j => j.id).sort());
      if (idsHash !== prevVisibleJobIdsRef.current) {
          prevVisibleJobIdsRef.current = idsHash;
          setFilteredAssignedJobs(visibleJobs);
      }
  }, [visibleReps, setFilteredAssignedJobs]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value.startsWith('skill-')) {
       const skill = value.replace('skill-', '') as any;
       setSortConfig({ key: skill, direction: 'desc' });
    } else {
       setSortConfig({ key: value as SortKey, direction: 'asc' });
    }
  };

  const renderFilterTabContent = () => {
      switch (activeTab) {
          case 'rep':
              return (
                  <div className="flex flex-wrap gap-1.5 items-center">
                      {appState.reps
                        .filter(rep => {
                            // Only show reps who are working (have jobs OR have available slots)
                            const jobCount = rep.schedule.flatMap(s => s.jobs).length;
                            const unavailableSlots = rep.unavailableSlots?.[selectedDay] || [];
                            const isFullyUnavailable = unavailableSlots.length === TIME_SLOTS.length && !rep.isOptimized;
                            return jobCount > 0 || !isFullyUnavailable;
                        })
                        .map(rep => {
                          const isMatch = rep.name.toLowerCase().includes(repSearchTerm.toLowerCase()) && repSearchTerm !== '';
                          const jobCount = rep.schedule.flatMap(s => s.jobs).length;
                          const isOptimized = rep.isOptimized;
                          
                          let chipClass = isMatch ? chipActiveClass : chipInactiveClass;
                          if (isOptimized) {
                              chipClass = isMatch ? chipOptimizedActiveClass : chipOptimizedInactiveClass;
                          }
                          
                          return (
                              <button key={rep.id} 
                                  onClick={() => setRepSearchTerm(prev => prev === rep.name ? '' : rep.name)} 
                                  className={`${chipClass} ${chipBaseClass}`}>
                                  {formatRepNameForFilter(rep.name)}
                                  {jobCount > 0 && (
                                      <span className={`ml-1.5 flex items-center justify-center h-4 min-w-[16px] px-1 text-[9px] font-bold rounded-full ${
                                          isMatch 
                                            ? (isOptimized ? 'bg-teal-500 text-white' : 'bg-indigo-500 text-white') 
                                            : (isOptimized ? 'bg-teal-100 text-teal-800' : 'bg-indigo-100 text-indigo-700')
                                      }`}>
                                          {jobCount}
                                      </span>
                                  )}
                              </button>
                          );
                      })}
                  </div>
              );
          case 'city':
              return (
                  <div className="flex flex-wrap gap-1.5 items-center">
                      {assignedCities.map(city => (
                          <button key={city} 
                              onClick={(e) => {
                                  e.preventDefault();
                                  if (e.altKey) {
                                      setCityFilters(prev => { const n = new Set(prev); n.has(city) ? n.delete(city) : n.add(city); return n; });
                                  } else {
                                      setCityFilters(prev => { if (prev.has(city) && prev.size === 1) return new Set(); return new Set([city]); });
                                  }
                              }}
                              className={`${cityFilters.has(city) ? chipActiveClass : chipInactiveClass} ${chipBaseClass}`}>
                              {city}
                          </button>
                      ))}
                  </div>
              );
          case 'tags':
          case 'skills': // Reusing UI for simplicity or expand later
              return <div className="text-xs text-gray-400 italic p-2 text-center">Filter by tags/skills coming soon. Use search for now.</div>;
      }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-3 border-b border-gray-100 pb-2">
        <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
            1. Schedules
            <div className="flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100 text-xs font-medium" title="Assigned Jobs">
                {assignedJobsCount} Assigned
            </div>
            {visibleReps.length > 0 && (
                <div className="flex items-center px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full border border-gray-200 text-xs font-medium" title="Average Score">
                    <TrophyIcon className="h-3 w-3 mr-1 text-amber-500" />
                    <span className="font-bold">Avg: {Math.round(visibleReps.reduce((acc, rep) => {
                        const jobs = rep.schedule.flatMap(s => s.jobs).filter(j => typeof j.assignmentScore === 'number');
                        if (jobs.length === 0) return acc;
                        const repAvg = jobs.reduce((sum, j) => sum + (j.assignmentScore || 0), 0) / jobs.length;
                        return acc + repAvg;
                    }, 0) / (visibleReps.filter(r => r.schedule.flatMap(s => s.jobs).some(j => typeof j.assignmentScore === 'number')).length || 1))}</span>
                </div>
            )}
        </h2>
        
        <div className="flex items-center gap-2">
            <div className="relative group">
                <input 
                    type="text" 
                    className={`
                        pl-8 pr-7 py-1.5 text-xs border border-gray-300 bg-white rounded-md 
                        focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all w-32 focus:w-48
                        ${repSearchTerm ? 'w-48 border-indigo-300 ring-1 ring-indigo-50' : ''}
                    `}
                    placeholder="Search reps..." 
                    value={repSearchTerm} 
                    onChange={e => setRepSearchTerm(e.target.value)} 
                />
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <SearchIcon className="h-3.5 w-3.5" />
                </div>
                {repSearchTerm && (
                    <button onClick={() => setRepSearchTerm('')} className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer">
                        <XIcon className="h-3 w-3" />
                    </button>
                )}
            </div>
            
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

      {/* Filters Section */}
      <div className="bg-gray-50 rounded-lg p-1.5 mb-3 border border-gray-200">
          <div className="flex gap-1 mb-2 select-none">
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="rep" label="By Region" icon={<UserIcon />} />
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="city" label="By City" icon={<MapPinIcon />} />
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="tags" label="By Attributes" icon={<TagIcon />} />
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="skills" label="By Skill" icon={<StarIcon />} />
          </div>
          
          <div className="flex items-center justify-between px-1 mb-1">
                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                     {activeTab === 'city' ? 'Filter by City (Alt+Click for Multi)' : activeTab === 'rep' ? 'Filter by Rep (Click to Select)' : 'Filter Options'}
                 </span>
                 {(cityFilters.size > 0 || repSearchTerm) && (
                    <button onClick={() => { setCityFilters(new Set()); setRepSearchTerm(''); }} className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-red-50">
                        <XIcon className="h-3 w-3" /> Clear Filters 
                    </button>
                 )}
            </div>

          <div className="max-h-[100px] overflow-y-auto p-2 bg-white rounded border border-gray-200 custom-scrollbar">
              {renderFilterTabContent()}
          </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center justify-between bg-white p-1 rounded border border-gray-100">
        <div className="flex items-center space-x-1">
            <button 
                onClick={() => handleToggleAllReps(visibleReps)} 
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-indigo-600 transition"
                title={expandedRepIds.size === visibleReps.length ? "Collapse All" : "Expand All"}
            >
                {expandedRepIds.size === visibleReps.length ? <CollapseAllIcon className="h-4 w-4" /> : <ExpandAllIcon className="h-4 w-4" />}
            </button>
            
            <button 
                onClick={handleClearAllSchedules} 
                disabled={assignedJobsCount === 0}
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition disabled:opacity-30"
                title="Unassign All Jobs"
            >
                <UnassignAllIcon className="h-4 w-4" />
            </button>
            
            <div className="h-4 w-px bg-gray-200 mx-1"></div>

            <button 
                onClick={() => setLockFilter(prev => prev === 'locked' ? 'all' : 'locked')}
                className={`p-1.5 rounded transition ${lockFilter === 'locked' ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                title="Show Locked Only"
            >
                <LockIcon className="h-3.5 w-3.5" />
            </button>
             <button 
                onClick={() => setLockFilter(prev => prev === 'unlocked' ? 'all' : 'unlocked')}
                className={`p-1.5 rounded transition ${lockFilter === 'unlocked' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                title="Show Unlocked Only"
            >
                <UnlockIcon className="h-3.5 w-3.5" />
            </button>
        </div>

        <div className="flex items-center space-x-2">
            <label htmlFor="sort-select" className="text-xs font-semibold text-gray-500">Sort:</label>
            <select
                id="sort-select"
                className="text-xs border border-gray-300 rounded p-1 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
                value={sortConfig.key === 'Tile' || sortConfig.key === 'Shingle' || sortConfig.key === 'Flat' ? `skill-${sortConfig.key}` : sortConfig.key}
                onChange={handleSortChange}
            >
                <option value="name">Name (A-Z)</option>
                <option value="salesRank">Sales Rank (Best First)</option>
                <option value="jobCount">Most Jobs</option>
                <option value="cityCount">City Spread</option>
                <option value="availability">Availability</option>
                <option value="skillCount">Total Skill Level</option>
                <optgroup label="By Skill Level">
                    <option value="skill-Tile">Best Tile</option>
                    <option value="skill-Shingle">Best Shingle</option>
                    <option value="skill-Flat">Best Flat</option>
                    <option value="skill-Metal">Best Metal</option>
                    <option value="skill-Insurance">Best Insurance</option>
                    <option value="skill-Commercial">Best Commercial</option>
                </optgroup>
            </select>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
        {isLoadingReps ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <LoadingIcon className="text-indigo-500 h-8 w-8 mb-2" />
            <p className="text-sm font-medium">Loading Reps...</p>
          </div>
        ) : repsError ? (
          <div className="flex flex-col items-center justify-center h-32 text-red-500 bg-red-50 rounded-lg p-4 border border-red-100">
            <ErrorIcon className="h-8 w-8 mb-2" />
            <p className="text-sm text-center">{repsError}</p>
          </div>
        ) : visibleReps.length > 0 ? (
          visibleReps.map(rep => (
            <RepSchedule
              key={rep.id}
              rep={rep}
              selectedDay={selectedDay}
              onJobDrop={handleJobDrop}
              onUnassign={handleUnassignJob}
              onToggleLock={handleToggleRepLock}
              onUpdateJob={handleUpdateJob}
              onRemoveJob={handleRemoveJob}
              isSelected={rep.id === selectedRepId}
              onSelectRep={(e) => { handleShowRoute(rep.id, false); }}
              isExpanded={expandedRepIds.has(rep.id)}
              onToggleExpansion={() => handleToggleRepExpansion(rep.id)}
              draggedOverRepId={draggedOverRepId}
              onSetDraggedOverRepId={setDraggedOverRepId}
              onJobDragStart={setDraggedJob}
              onJobDragEnd={handleJobDragEnd}
              draggedJob={draggedJob}
              isInvalidDropTarget={draggedJob ? checkCityRuleViolation(rep, draggedJob.city).violated : false}
              invalidReason="Max Cities Reached"
              isOverrideActive={isOverrideActive}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <p className="text-sm italic">No reps match your filter.</p>
          </div>
        )}
      </div>
    </>
  );
};

export default SchedulesPanel;