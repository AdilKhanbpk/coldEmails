import { useMemo } from 'react';
import { format } from 'date-fns';

/**
 * Custom hook that memoizes date formatting to avoid redundant calls to date-fns.
 * 
 * This hook prevents expensive date formatting operations from running on every render.
 * The formatted string is only recalculated when the date or format string changes.
 * 
 * Performance Impact: In a table with 100 rows displaying 2 dates each, this prevents
 * 200 redundant format() calls per render.
 * 
 * @param date - The date to format (string, Date object, or null)
 * @param formatString - The format string (e.g., 'MMM d, yyyy', 'HH:mm')
 * @returns Formatted date string, or empty string if date is null
 * 
 * @example
 * function LeadRow({ lead }) {
 *   const createdDate = useFormattedDate(lead.createdAt, 'MMM d, yyyy');
 *   const preferredTime = useFormattedDate(lead.preferredTime, 'MMM d, yyyy HH:mm');
 *   
 *   return (
 *     <tr>
 *       <td>{lead.companyName}</td>
 *       <td>{createdDate}</td>
 *       <td>{preferredTime}</td>
 *     </tr>
 *   );
 * }
 */
export function useFormattedDate(date: string | Date | null, formatString: string): string {
  return useMemo(() => {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return format(dateObj, formatString);
  }, [date, formatString]);
}
