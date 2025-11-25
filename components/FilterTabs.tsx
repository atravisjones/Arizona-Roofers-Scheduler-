
import React, { useState, useMemo, useEffect } from 'react';
import { Job } from '../types';
import { TAG_KEYWORDS } from '../constants';
import { MapPinIcon, RoofIcon, StoriesIcon, SizeIcon, XIcon, TagIcon, StarIcon, ClockIcon } from './icons';
import { EAST_TO_WEST_CITIES } from '../services/geography';

type ActiveTab = 'city' | 'tags' | 'time';

interface FilterTabsProps {
    unassignedJobs: Job[];
    onFilterChange: (filteredJobs: Job[]) => void;
}

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

const FilterTabs: React.FC<FilterTabsProps> = ({ unassignedJobs, onFilterChange }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('city');
    
    // State for each filter type
    const [cityFilters, setCityFilters] = useState<Set<string>>(new Set());
    const [timeFilters, setTimeFilters] = useState<Set<string>>(new Set());
    const [tagFilters, setTagFilters] = useState<{
        roofTypes: Set<string>;
        stories: Set<string>;
        sizes: Set<string>;
        priority: boolean;
        ages: Set<string>;
    }>({ roofTypes: new Set(), stories: new Set(), sizes: new Set(), priority: false, ages: new Set() });

    // Memoize available cities, tags, and time slots
    const availableCities = useMemo(() => {
        const cityOrder = EAST_TO_WEST_CITIES.reduce((acc, city, index) => {
            acc[city] = index;
            return acc;
        }, {} as Record<string, number>);

        const cities = Array.from(new Set(unassignedJobs.map(j => j.city).filter((c): c is string => !!c)))
            .sort((a: string, b: string) => {
                const orderA = cityOrder[a.toUpperCase()] ?? 999;
                const orderB = cityOrder[b.toUpperCase()] ?? 999;
                return orderA - orderB;
            });
        
        if (unassignedJobs.some(j => !j.city)) {
            cities.push('Misc.');
        }
        return cities;
    }, [unassignedJobs]);

    const availableTags = useMemo(() => {
        const roofTypes = new Set<string>();
        const stories = new Set<string>();
        const sizeBuckets = new Set<string>();
        const ageBuckets = new Set<string>();

        const sizeToBucket = (sqft: number) => {
            if (sqft < 1500) return '< 1500 sqft';
            if (sqft <= 2500) return '1500-2500 sqft';
            return '> 2500 sqft';
        };
        const ageToBucket = (age: number) => {
            if (age <= 5) return '0-5 yrs';
            if (age <= 10) return '6-10 yrs';
            if (age <= 15) return '11-15 yrs';
            if (age <= 20) return '16-20 yrs';
            return '> 20 yrs';
        };

        unassignedJobs.forEach(job => {
            const notesLower = job.notes.toLowerCase();
            TAG_KEYWORDS.forEach(keyword => {
                if (new RegExp(`\\b${keyword.toLowerCase()}\\b`).test(notesLower)) {
                    roofTypes.add(keyword);
                }
            });
            const storiesMatch = job.notes.match(/\b(\d)S\b/i);
            if (storiesMatch) stories.add(storiesMatch[1]);
            const sqftMatch = job.notes.match(/\b(\d+)\s*sq/i);
            if (sqftMatch) sizeBuckets.add(sizeToBucket(parseInt(sqftMatch[1], 10)));
            const ageMatch = job.notes.match(/\b(\d+)\s*yrs\b/i);
            if (ageMatch) ageBuckets.add(ageToBucket(parseInt(ageMatch[1], 10)));
        });

        return {
            roofTypes: Array.from(roofTypes).sort(),
            stories: Array.from(stories).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
            sizes: ['< 1500 sqft', '1500-2500 sqft', '> 2500 sqft'].filter(bucket => sizeBuckets.has(bucket)),
            ages: ['0-5 yrs', '6-10 yrs', '11-15 yrs', '16-20 yrs', '> 20 yrs'].filter(
                bucket => ageBuckets.has(bucket)
            ),
        };
    }, [unassignedJobs]);
    
    const availableTimeSlots = useMemo(() => {
        const slots = new Set<string>();
        unassignedJobs.forEach(job => {
            if (job.originalTimeframe) {
                slots.add(job.originalTimeframe);
            } else {
                slots.add('Unspecified');
            }
        });
        return Array.from(slots).sort((a, b) => {
            if (a === 'Unspecified') return 1;
            if (b === 'Unspecified') return -1;
            const getStartHour = (s: string) => {
                const match = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
                if (!match) return 99;
                let h = parseInt(match[1]);
                const period = match[3]?.toLowerCase();
                if (period === 'pm' && h < 12) h += 12;
                if (period === 'am' && h === 12) h = 0;
                return h;
            };
            return getStartHour(a) - getStartHour(b);
        });
    }, [unassignedJobs]);

    // Effect to run filtering logic and notify parent component
    useEffect(() => {
        let filtered = [...unassignedJobs];

        if (activeTab === 'city' && cityFilters.size > 0) {
            filtered = filtered.filter(job => {
                const jobCity = job.city || 'Misc.';
                return cityFilters.has(jobCity);
            });
        } else if (activeTab === 'tags') {
            const { roofTypes, stories, sizes, priority, ages } = tagFilters;

            if (priority) {
                filtered = filtered.filter(job => job.notes.includes('#'));
            }

            if (roofTypes.size > 0) {
                filtered = filtered.filter(job => Array.from(roofTypes).some(type => new RegExp(`\\b${type}\\b`, 'i').test(job.notes)));
            }
            if (stories.size > 0) {
                filtered = filtered.filter(job => Array.from(stories).some(story => new RegExp(`\\b${story}S\\b`, 'i').test(job.notes)));
            }
            if (sizes.size > 0) {
                filtered = filtered.filter(job => {
                    const sqftMatch = job.notes.match(/\b(\d+)\s*sq/i);
                    if (!sqftMatch) return false;
                    const sqft = parseInt(sqftMatch[1], 10);
                    return Array.from(sizes).some(bucket => {
                        if (bucket === '< 1500 sqft' && sqft < 1500) return true;
                        if (bucket === '1500-2500 sqft' && sqft >= 1500 && sqft <= 2500) return true;
                        if (bucket === '> 2500 sqft' && sqft > 2500) return true;
                        return false;
                    });
                });
            }
            if (ages.size > 0) {
                filtered = filtered.filter(job => {
                    const ageMatch = job.notes.match(/\b(\d+)\s*yrs\b/i);
                    if (!ageMatch) return false;
                    const age = parseInt(ageMatch[1], 10);
                    const ageToBucket = (age: number) => {
                        if (age <= 5) return '0-5 yrs';
                        if (age <= 10) return '6-10 yrs';
                        if (age <= 15) return '11-15 yrs';
                        if (age <= 20) return '16-20 yrs';
                        return '> 20 yrs';
                    };
                    const bucket = ageToBucket(age);
                    return Array.from(ages).some(filterBucket => filterBucket === bucket);
                });
            }
        } else if (activeTab === 'time' && timeFilters.size > 0) {
            filtered = filtered.filter(job => {
                const tf = job.originalTimeframe || 'Unspecified';
                return timeFilters.has(tf);
            });
        }

        onFilterChange(filtered);
    }, [unassignedJobs, activeTab, cityFilters, tagFilters, timeFilters, onFilterChange]);

    const handleClearFilters = () => {
        setCityFilters(new Set());
        setTimeFilters(new Set());
        setTagFilters({ roofTypes: new Set(), stories: new Set(), sizes: new Set(), priority: false, ages: new Set() });
    };

    const hasActiveFilters = cityFilters.size > 0 || timeFilters.size > 0 || Object.values(tagFilters).some(f => (f instanceof Set && f.size > 0) || (typeof f === 'boolean' && f));

    const renderTabContent = () => {
        switch (activeTab) {
            case 'city':
                return (
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {availableCities.map(city => (
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
            case 'time':
                return (
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {availableTimeSlots.map(slot => (
                            <button key={slot} 
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (e.altKey) {
                                        setTimeFilters(prev => { const n = new Set(prev); n.has(slot) ? n.delete(slot) : n.add(slot); return n; });
                                    } else {
                                        setTimeFilters(prev => { if (prev.has(slot) && prev.size === 1) return new Set(); return new Set([slot]); });
                                    }
                                }}
                                className={`${timeFilters.has(slot) ? chipActiveClass : chipInactiveClass} ${chipBaseClass}`}>
                                {slot}
                            </button>
                        ))}
                    </div>
                );
            case 'tags':
                return (
                     <div className="space-y-1.5">
                        <div className="flex items-start gap-2">
                             <span className="w-12 pt-0.5 text-[9px] font-bold text-gray-400 uppercase text-right flex-shrink-0">Status</span>
                            <button onClick={() => setTagFilters(f => ({ ...f, priority: !f.priority }))} className={`${tagFilters.priority ? 'bg-yellow-100 text-yellow-800 border-yellow-300 ring-1 ring-yellow-400/50' : chipInactiveClass} ${chipBaseClass}`}>
                                <StarIcon className={`h-3 w-3 ${tagFilters.priority ? 'text-yellow-600' : 'text-gray-400'}`} /> 
                                Priority Job (#)
                            </button>
                        </div>

                        {availableTags.roofTypes.length > 0 && (
                            <div className="flex items-start gap-2">
                                <span className="w-12 pt-0.5 text-[9px] font-bold text-gray-400 uppercase text-right flex-shrink-0">Roof</span>
                                <div className="flex flex-wrap gap-1">
                                    {availableTags.roofTypes.map(tag => (
                                        <button key={tag} onClick={() => setTagFilters(f => { const n = new Set(f.roofTypes); n.has(tag) ? n.delete(tag) : n.add(tag); return { ...f, roofTypes: n }; })} className={`${tagFilters.roofTypes.has(tag) ? chipActiveClass : chipInactiveClass} ${chipBaseClass}`}>{tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {availableTags.stories.length > 0 && (
                            <div className="flex items-start gap-2">
                                <span className="w-12 pt-0.5 text-[9px] font-bold text-gray-400 uppercase text-right flex-shrink-0">Height</span>
                                <div className="flex flex-wrap gap-1">
                                    {availableTags.stories.map(tag => (
                                        <button key={tag} onClick={() => setTagFilters(f => { const n = new Set(f.stories); n.has(tag) ? n.delete(tag) : n.add(tag); return { ...f, stories: n }; })} className={`${tagFilters.stories.has(tag) ? chipActiveClass : chipInactiveClass} ${chipBaseClass}`}>{tag} Story</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {availableTags.ages.length > 0 && (
                             <div className="flex items-start gap-2">
                                <span className="w-12 pt-0.5 text-[9px] font-bold text-gray-400 uppercase text-right flex-shrink-0">Age</span>
                                <div className="flex flex-wrap gap-1">
                                    {availableTags.ages.map(tag => (
                                        <button key={tag} onClick={() => setTagFilters(f => { const n = new Set(f.ages); n.has(tag) ? n.delete(tag) : n.add(tag); return { ...f, ages: n }; })} className={`${tagFilters.ages.has(tag) ? chipActiveClass : chipInactiveClass} ${chipBaseClass}`}>{tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                         {availableTags.sizes.length > 0 && (
                            <div className="flex items-start gap-2">
                                <span className="w-12 pt-0.5 text-[9px] font-bold text-gray-400 uppercase text-right flex-shrink-0">Size</span>
                                <div className="flex flex-wrap gap-1">
                                    {availableTags.sizes.map(tag => (
                                        <button key={tag} onClick={() => setTagFilters(f => { const n = new Set(f.sizes); n.has(tag) ? n.delete(tag) : n.add(tag); return { ...f, sizes: n }; })} className={`${tagFilters.sizes.has(tag) ? chipActiveClass : chipInactiveClass} ${chipBaseClass}`}>{tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="mb-2">
            <div className="flex p-1 bg-gray-100 rounded-lg mb-3 gap-1 select-none">
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="city" label="By City" icon={<MapPinIcon />} />
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="time" label="By Time" icon={<ClockIcon />} />
                <TabButton activeTab={activeTab} onClick={setActiveTab} tabId="tags" label="By Tags" icon={<TagIcon />} />
            </div>
            <div className="flex items-center justify-between px-1 mb-1">
                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                     {activeTab === 'city' ? 'Filter by City (Alt+Click for Multi)' : activeTab === 'time' ? 'Filter by Time Slot (Alt+Click for Multi)' : 'Filter by Attributes'}
                 </span>
                 {hasActiveFilters && (
                    <button onClick={handleClearFilters} className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-red-50">
                        <XIcon className="h-3 w-3" /> Clear Filters 
                    </button>
                 )}
            </div>
            <div className="max-h-[140px] overflow-y-auto p-2 bg-white rounded-lg border border-gray-200 shadow-sm custom-scrollbar">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default FilterTabs;
