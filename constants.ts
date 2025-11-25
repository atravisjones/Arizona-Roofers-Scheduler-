
import { TimeSlot } from './types';

// WARNING: Storing API keys in client-side code is insecure.
// This is for demonstration purposes only. The API key is used for Google Maps and Google Sheets.
export const GOOGLE_API_KEY = "AIzaSyAUU9vrRIAepLUJedcIrmmfJDyVKjGhINI";

// Google Sheets API connection details
export const SPREADSHEET_ID = "1cFFEZNl7wXt40riZHnuZxGc1Zfm5lTlOz0rDCWGZJ0g";
export const SHEET_TITLE_PREFIX = "SRA";
export const DATA_RANGE = 'A2:H200'; // Fetch data starting from row 2 to include the date headers.

// Rep skillsets sheet details
export const SKILLS_SHEET_TITLE = 'Appointment Blocks';
export const SKILLS_DATA_RANGE = 'A19:H52';
export const SALES_ORDER_DATA_RANGE = 'B44:B85'; // Fetching column B where names are listed in order

// If fetching data fails, use mock data to allow the app to run.
export const USE_MOCK_DATA_ON_FAILURE = true;

export const TIME_SLOTS: TimeSlot[] = [
  { id: 'ts-1', label: '7:30am - 10am' },
  { id: 'ts-2', label: '10am - 1pm' },
  { id: 'ts-3', label: '1pm - 4pm' },
  { id: 'ts-4', label: '4pm - 7pm' },
];

export const ROOF_KEYWORDS: readonly ['Tile', 'Shingle', 'Flat', 'Metal'] = ['Tile', 'Shingle', 'Flat', 'Metal'];
export const TYPE_KEYWORDS: readonly ['Insurance', 'Commercial'] = ['Insurance', 'Commercial'];

export const TAG_KEYWORDS: readonly string[] = [...ROOF_KEYWORDS, ...TYPE_KEYWORDS];
