/**
 * Serialize Mongoose documents to plain JSON-serializable objects.
 * 
 * This helper converts Mongoose Documents (including nested subdocuments with ObjectIds)
 * into plain JavaScript objects that can be safely passed to React Client Components.
 * 
 * Why needed:
 * - Mongoose Documents have internal machinery and non-enumerable properties
 * - ObjectIds and Dates need to be converted to strings
 * - React Server Components require plain, JSON-serializable props
 * 
 * @param doc - Any Mongoose document or plain object
 * @returns A plain JavaScript object with all ObjectIds and Dates converted to strings
 */
export function serializeDoc<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc));
}
