
import React, { useState, useEffect, useCallback } from 'react';

// Simple debounce function
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };

  return debounced as (...args: Parameters<F>) => void;
};


const NotesWidget: React.FC = () => {
    const [notes, setNotes] = useState<string>('');
    const storageKey = 'daily-notes';

    // Load notes from localStorage on initial render
    useEffect(() => {
        try {
            const savedNotes = localStorage.getItem(storageKey);
            if (savedNotes) {
                setNotes(savedNotes);
            }
        } catch (error) {
            console.error("Could not load notes from localStorage", error);
        }
    }, []);

    // Debounced function to save notes
    const saveNotes = useCallback((value: string) => {
        try {
            localStorage.setItem(storageKey, value);
        } catch (error) {
            console.error("Could not save notes to localStorage", error);
        }
    }, [storageKey]);

    const debouncedSave = useCallback(debounce(saveNotes, 500), [saveNotes]);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = event.target.value;
        setNotes(newValue);
        debouncedSave(newValue);
    };

    return (
        <div className="mb-4">
            <label htmlFor="daily-notes" className="block text-sm font-medium text-gray-700 mb-1">
                Daily Notes
            </label>
            <textarea
                id="daily-notes"
                rows={5}
                className="w-full p-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition"
                placeholder="Add any notes for the day here..."
                value={notes}
                onChange={handleChange}
            />
        </div>
    );
};

export default NotesWidget;
