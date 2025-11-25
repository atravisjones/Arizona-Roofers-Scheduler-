import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { XIcon } from './icons';

// A completely redesigned, better-styled calendar component for adding new days.
const CalendarPicker: React.FC<{ onSelect: (date: Date) => void }> = ({ onSelect }) => {
    const [displayDate, setDisplayDate] = useState(new Date());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const changeMonth = (offset: number) => {
        setDisplayDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(1); // Avoids issues with different month lengths
            newDate.setMonth(newDate.getMonth() + offset);
            return newDate;
        });
    };

    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const calendarDays = [];
    // Pad start of month
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarDays.push(<div key={`pad-${i}`} className="w-10 h-10"></div>);
    }
    // Fill month days
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const isToday = currentDate.getTime() === today.getTime();

        calendarDays.push(
            <button
                key={day}
                onClick={() => onSelect(currentDate)}
                className={`w-10 h-10 flex items-center justify-center rounded-full text-sm transition-colors
                    ${isToday ? 'border-2 border-indigo-500 font-bold' : ''}
                    ${!isToday ? 'hover:bg-indigo-100' : 'hover:bg-indigo-200'}
                `}
            >
                {day}
            </button>
        );
    }

    return (
        <div className="bg-white border rounded-lg p-4 shadow-lg w-80">
            <div className="flex justify-between items-center mb-3">
                <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600">&lt;</button>
                <div className="font-bold text-base text-gray-800">
                    {displayDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
                <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 font-semibold mb-2">
                <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {calendarDays}
            </div>
             <button
                onClick={() => onSelect(today)}
                className="w-full mt-3 py-2 text-sm font-semibold bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition"
            >
                Go to Today
            </button>
        </div>
    );
};


const DayTabs: React.FC = () => {
    const { activeDayKeys, selectedDate, setSelectedDate, addActiveDay, removeActiveDay } = useAppContext();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const calendarRef = useRef<HTMLDivElement>(null);

    const handleSelectDay = (date: Date) => {
        addActiveDay(date);
        setIsCalendarOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
                setIsCalendarOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedKey = selectedDate.toISOString().split('T')[0];

    return (
        <div className="flex items-center space-x-1 bg-white border border-gray-300 rounded-md p-1 shadow-sm">
            {activeDayKeys.map(dateKey => {
                const date = new Date(dateKey + 'T12:00:00'); // Use noon to avoid timezone shifts
                const isSelected = dateKey === selectedKey;
                
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dayOfMonth = date.getDate();
                
                return (
                    <div
                        key={dateKey}
                        onClick={() => setSelectedDate(date)}
                        className={`relative flex items-center space-x-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors group ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                    >
                        <span className="font-semibold text-sm">{dayName} {dayOfMonth}</span>
                        {activeDayKeys.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeActiveDay(dateKey);
                                }}
                                className={`absolute -top-1 -right-1 p-0.5 rounded-full ${isSelected ? 'bg-indigo-400 hover:bg-indigo-300' : 'bg-gray-300 hover:bg-red-500 hover:text-white'}`}
                            >
                                <XIcon className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                );
            })}
            <div className="relative" ref={calendarRef}>
                <button
                    onClick={() => setIsCalendarOpen(prev => !prev)}
                    className="px-3 py-1.5 text-sm font-semibold bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition"
                    title="Add a new day to your workspace"
                >
                    + Add Day
                </button>
                {isCalendarOpen && (
                    <div className="absolute top-full right-0 mt-2 z-50">
                        <CalendarPicker onSelect={handleSelectDay} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default DayTabs;